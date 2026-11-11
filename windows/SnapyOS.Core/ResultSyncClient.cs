using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SnapyOS.Core;

public sealed record OutputSyncFile(string Kind, string Path, long SizeBytes, string Sha256, string Format);

public sealed record OutputSyncRequest(
    string BusinessSlug,
    string PhotoboxSlug,
    string DeviceId,
    string SessionId,
    string PackageId,
    string TransactionReference,
    DateTimeOffset ClientCreatedAt,
    DateTimeOffset RetentionUntil,
    string IdempotencyKey,
    ResultManifest Manifest,
    IReadOnlyList<OutputSyncFile> Outputs);

public sealed record CloudSession(string SessionId);

public sealed class CloudSyncException : HttpRequestException
{
    public CloudSyncException(string message, HttpStatusCode statusCode, string? code = null)
        : base(message, null, statusCode)
    {
        Code = code;
    }

    public string? Code { get; }
    public bool IsPermanent => StatusCode == HttpStatusCode.Gone || Code == "SESSION_EXPIRED" ||
        ((int?)StatusCode is >= 400 and < 500 && StatusCode != HttpStatusCode.RequestTimeout && StatusCode != (HttpStatusCode)429);
}

public interface IOutputSyncPublisher
{
    Task<CloudSession> CreateSessionAsync(OutputSyncRequest request, string deviceToken, CancellationToken cancellationToken = default);
    Task<CloudResultAck> UploadOutputsAsync(OutputSyncRequest request, CloudSession session, string deviceToken, CancellationToken cancellationToken = default);
}

public sealed class ResultSyncClient(HttpClient http) : IOutputSyncPublisher
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };
    private readonly HttpClient _http = http;

    public async Task<CloudSession> CreateSessionAsync(OutputSyncRequest request, string deviceToken, CancellationToken cancellationToken = default)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/public/{Uri.EscapeDataString(request.BusinessSlug)}/sessions");
        message.Headers.Add("Idempotency-Key", request.IdempotencyKey);
        message.Content = JsonContent.Create(new
        {
            package_id = request.PackageId,
            client_created_at = request.ClientCreatedAt,
            device_token = deviceToken,
            transaction_reference = request.TransactionReference,
            device_id = request.DeviceId,
            retention_until = request.RetentionUntil
        });
        using var response = await _http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        var envelope = await ReadEnvelopeAsync(response, cancellationToken).ConfigureAwait(false);
        if (envelope is null || envelope.Data is not { } data) throw new InvalidDataException("Cloud create response is empty.");
        var id = data.GetProperty("session_id").GetString();
        if (string.IsNullOrWhiteSpace(id)) throw new InvalidDataException("Cloud create response has no session_id.");
        return new CloudSession(id);
    }

    public async Task<CloudResultAck> UploadOutputsAsync(OutputSyncRequest request, CloudSession session, string deviceToken, CancellationToken cancellationToken = default)
    {
        ValidateOutputs(request.Outputs, request.Manifest);
        using var form = new MultipartFormDataContent();
        Add(form, "device_token", deviceToken);
        Add(form, "device_id", request.DeviceId);
        Add(form, "session_id", session.SessionId);
        Add(form, "transaction_reference", request.TransactionReference);
        Add(form, "retention_until", request.RetentionUntil.ToString("O"));
        Add(form, "manifest", JsonSerializer.Serialize(request.Manifest, Json));

        foreach (var output in request.Outputs)
        {
            var stream = new FileStream(output.Path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.SequentialScan);
            var content = new StreamContent(stream);
            content.Headers.ContentType = new MediaTypeHeaderValue(ContentType(output.Format));
            form.Add(content, output.Kind, Path.GetFileName(output.Path));
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/public/{Uri.EscapeDataString(request.BusinessSlug)}/results/sync")
        {
            Content = form
        };
        message.Headers.Add("Idempotency-Key", request.IdempotencyKey);
        using var response = await _http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        var envelope = await ReadEnvelopeAsync(response, cancellationToken).ConfigureAwait(false);
        var data = envelope?.Data ?? throw new InvalidDataException("Cloud ACK is empty.");
        var token = data.GetProperty("result_token").GetString();
        var url = data.GetProperty("public_result_url").GetString();
        DateTimeOffset? retention = null;
        if (data.TryGetProperty("retention_until", out var retentionValue) && retentionValue.ValueKind != JsonValueKind.Null)
            retention = retentionValue.GetDateTimeOffset();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(url)) throw new InvalidDataException("Cloud ACK is incomplete.");
        return new CloudResultAck(token, url, retention);
    }

    private static void Add(MultipartFormDataContent form, string name, string value) =>
        form.Add(new StringContent(value, Encoding.UTF8), name);

    private static string ContentType(string format) => format.ToLowerInvariant() switch
    {
        "gif" => "image/gif",
        "png" => "image/png",
        _ => "image/jpeg"
    };

    private static void ValidateOutputs(IReadOnlyList<OutputSyncFile> outputs, ResultManifest manifest)
    {
        if (outputs.Count == 0 || outputs.Count != manifest.Outputs.Count) throw new InvalidDataException("Output set does not match manifest.");
        foreach (var output in outputs)
        {
            if (output.Kind is not ("photo_strip" or "gif") || string.IsNullOrWhiteSpace(output.Path) || !Path.IsPathFullyQualified(output.Path))
                throw new InvalidDataException("Only final output files may be uploaded.");
            var metadata = manifest.Outputs.SingleOrDefault(item => item.Kind == output.Kind);
            if (metadata is null || !string.Equals(metadata.FileName, Path.GetFileName(output.Path), StringComparison.Ordinal) ||
                metadata.SizeBytes != output.SizeBytes || !string.Equals(metadata.Sha256, output.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Output does not match manifest metadata.");
        }
    }

    private static async Task<ApiEnvelope?> ReadEnvelopeAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        ApiEnvelope? envelope = null;
        try { envelope = JsonSerializer.Deserialize<ApiEnvelope>(body, Json); }
        catch (JsonException) when (!response.IsSuccessStatusCode) { }
        if (!response.IsSuccessStatusCode)
        {
            var code = envelope?.Error?.Code;
            throw new CloudSyncException($"Cloud sync failed: {(int)response.StatusCode}.", response.StatusCode, code);
        }
        return envelope;
    }

    private sealed record ApiEnvelope(JsonElement? Data, ApiError? Error);
    private sealed record ApiError([property: JsonPropertyName("code")] string? Code);
}
