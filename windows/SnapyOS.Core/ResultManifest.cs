using System.Text.Json;
using System.Text.Json.Serialization;

namespace SnapyOS.Core;

public enum ResultUploadState { PendingUpload, Uploading, CloudAcked, Failed }
public enum ResultAccessState { LocalOnly, PublicQrReady, Expired }

public sealed record ResultOutputMetadata(
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("file_name")] string FileName,
    [property: JsonPropertyName("size_bytes")] long SizeBytes,
    [property: JsonPropertyName("sha256")] string Sha256,
    [property: JsonPropertyName("format")] string Format);

public sealed record ResultManifest(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("transaction_reference")] string TransactionReference,
    [property: JsonPropertyName("outputs")] IReadOnlyList<ResultOutputMetadata> Outputs,
    [property: JsonPropertyName("upload_state")] ResultUploadState UploadState,
    [property: JsonPropertyName("access_state")] ResultAccessState AccessState,
    [property: JsonPropertyName("retention_until")] DateTimeOffset RetentionUntil,
    [property: JsonPropertyName("cloud_result_token")] string? CloudResultToken = null,
    [property: JsonPropertyName("public_result_url")] string? PublicResultUrl = null)
{
    [JsonIgnore] public bool HasRawPhoto => Outputs.Any(x => ResultManifestFactory.IsRawPhotoKind(x.Kind));
}

public sealed record CloudResultAck(string ResultToken, string PublicResultUrl, DateTimeOffset? RetentionUntil = null);

public static class ResultManifestFactory
{
    private static readonly HashSet<string> RawPhotoKinds = new(StringComparer.OrdinalIgnoreCase)
    {
        "photo", "raw_photo", "raw-photo", "capture", "raw_capture", "raw-capture"
    };

    private static readonly HashSet<string> FinalOutputKinds = new(StringComparer.OrdinalIgnoreCase)
    {
        "photo_strip", "gif"
    };

    public static ResultManifest Create(string sessionId, string transactionReference, IReadOnlyList<MediaOutputDescriptor> outputs, DateTimeOffset retentionUntil)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) throw new ArgumentException("Session ID is required.", nameof(sessionId));
        if (string.IsNullOrWhiteSpace(transactionReference)) throw new ArgumentException("Transaction reference is required.", nameof(transactionReference));
        if (outputs is null || outputs.Count == 0) throw new ArgumentException("At least one final output is required.", nameof(outputs));

        var metadata = outputs.Select(ToMetadata).ToArray();
        var manifest = new ResultManifest(sessionId, transactionReference, metadata, ResultUploadState.PendingUpload, ResultAccessState.LocalOnly, retentionUntil);
        Validate(manifest);
        return manifest;
    }

    public static ResultManifest Create(
        string sessionId,
        string transactionReference,
        MediaOutput? photoStrip,
        LocalGifOutput? gif,
        DateTimeOffset retentionUntil)
    {
        var outputs = new List<MediaOutputDescriptor>();
        if (photoStrip is not null)
            outputs.Add(new("photo_strip", photoStrip.Path, photoStrip.SizeBytes, photoStrip.Sha256, photoStrip.Format.ToString().ToLowerInvariant()));
        if (gif is not null)
            outputs.Add(new("gif", gif.Path, gif.SizeBytes, gif.Sha256, "gif"));
        return Create(sessionId, transactionReference, outputs, retentionUntil);
    }

    public static ResultManifest MarkUploading(ResultManifest manifest)
    {
        Validate(manifest);
        if (manifest.UploadState is not (ResultUploadState.PendingUpload or ResultUploadState.Failed))
            throw new InvalidOperationException("Only pending or failed results can start upload.");
        return manifest with { UploadState = ResultUploadState.Uploading, AccessState = ResultAccessState.LocalOnly };
    }

    public static ResultManifest ApplyAck(ResultManifest manifest, CloudResultAck ack)
    {
        Validate(manifest);
        if (manifest.UploadState == ResultUploadState.CloudAcked)
        {
            if (string.Equals(manifest.CloudResultToken, ack.ResultToken, StringComparison.Ordinal) &&
                string.Equals(manifest.PublicResultUrl, ack.PublicResultUrl, StringComparison.Ordinal)) return manifest;
            throw new InvalidOperationException("A cloud-acked result cannot change its public identity.");
        }
        if (manifest.UploadState != ResultUploadState.Uploading)
            throw new InvalidOperationException("Cloud ACK requires an upload in progress.");
        ValidateAck(ack);
        return manifest with
        {
            UploadState = ResultUploadState.CloudAcked,
            AccessState = ResultAccessState.PublicQrReady,
            CloudResultToken = ack.ResultToken,
            PublicResultUrl = ack.PublicResultUrl,
            RetentionUntil = ack.RetentionUntil is { } ackRetention
                ? (ackRetention > manifest.RetentionUntil ? ackRetention : manifest.RetentionUntil)
                : manifest.RetentionUntil
        };
    }

    public static ResultManifest MarkFailed(ResultManifest manifest)
    {
        Validate(manifest);
        if (manifest.UploadState == ResultUploadState.CloudAcked)
            throw new InvalidOperationException("A cloud-acked result cannot be marked failed.");
        return manifest with { UploadState = ResultUploadState.Failed, AccessState = ResultAccessState.LocalOnly, CloudResultToken = null, PublicResultUrl = null };
    }

    public static ResultManifest MarkExpired(ResultManifest manifest, DateTimeOffset now)
    {
        Validate(manifest);
        if (manifest.RetentionUntil > now) throw new InvalidOperationException("Result retention has not expired.");
        if (manifest.UploadState != ResultUploadState.CloudAcked || manifest.AccessState != ResultAccessState.PublicQrReady)
            throw new InvalidOperationException("Only a public cloud result can expire.");
        return manifest with { AccessState = ResultAccessState.Expired, CloudResultToken = null, PublicResultUrl = null };
    }

    public static string QrPayload(ResultManifest manifest)
    {
        Validate(manifest);
        if (manifest.UploadState != ResultUploadState.CloudAcked || manifest.AccessState != ResultAccessState.PublicQrReady || string.IsNullOrWhiteSpace(manifest.PublicResultUrl) || manifest.RetentionUntil <= DateTimeOffset.UtcNow)
            throw new InvalidOperationException("Public QR is unavailable before cloud ACK or after retention expiry.");
        return manifest.PublicResultUrl;
    }

    public static bool IsRawPhotoKind(string kind) => !string.IsNullOrWhiteSpace(kind) && RawPhotoKinds.Contains(kind);

    public static void Validate(ResultManifest manifest)
    {
        if (string.IsNullOrWhiteSpace(manifest.SessionId)) throw new ArgumentException("Session ID is required.");
        if (string.IsNullOrWhiteSpace(manifest.TransactionReference)) throw new ArgumentException("Transaction reference is required.");
        if (manifest.Outputs is null || manifest.Outputs.Count == 0) throw new ArgumentException("At least one final output is required.");
        if (manifest.RetentionUntil == default || manifest.RetentionUntil.Offset != TimeSpan.Zero)
            throw new ArgumentException("Retention deadline must be a UTC timestamp.");
        foreach (var output in manifest.Outputs)
        {
            if (string.IsNullOrWhiteSpace(output.Kind) || !FinalOutputKinds.Contains(output.Kind) || IsRawPhotoKind(output.Kind))
                throw new ArgumentException("Manifest outputs must be final photo strip or GIF metadata only.");
            if (string.IsNullOrWhiteSpace(output.FileName) || output.FileName.Contains('/') || output.FileName.Contains('\\') || output.FileName is "." or "..")
                throw new ArgumentException("Manifest output must contain a file name, not a path.");
            if (output.SizeBytes <= 0 || string.IsNullOrWhiteSpace(output.Format) || !IsSha256(output.Sha256))
                throw new ArgumentException("Manifest output metadata is invalid.");
        }
        if (manifest.AccessState == ResultAccessState.PublicQrReady)
        {
            if (manifest.UploadState != ResultUploadState.CloudAcked || !IsPublicUrl(manifest.PublicResultUrl) || string.IsNullOrWhiteSpace(manifest.CloudResultToken))
                throw new ArgumentException("Public QR requires a cloud-acked result.");
        }
        else if (manifest.PublicResultUrl is not null || manifest.CloudResultToken is not null)
            throw new ArgumentException("Public result identity requires a public QR state.");
        if (manifest.AccessState == ResultAccessState.Expired && manifest.UploadState != ResultUploadState.CloudAcked)
            throw new ArgumentException("Only a cloud-acked result can expire.");
    }

    private static ResultOutputMetadata ToMetadata(MediaOutputDescriptor output) =>
        new(output.Kind, Path.GetFileName(output.Path), output.SizeBytes, output.Sha256, output.Format);

    private static void ValidateAck(CloudResultAck ack)
    {
        if (string.IsNullOrWhiteSpace(ack.ResultToken) || !IsPublicUrl(ack.PublicResultUrl))
            throw new ArgumentException("Cloud ACK must contain a result token and absolute public URL.", nameof(ack));
        if (ack.RetentionUntil is { } retention && (retention == default || retention.Offset != TimeSpan.Zero))
            throw new ArgumentException("Cloud ACK retention deadline must be UTC.", nameof(ack));
    }

    private static bool IsSha256(string? value) => value is not null && value.Length == 64 && value.All(Uri.IsHexDigit);

    private static bool IsPublicUrl(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri is not { IsAbsoluteUri: true, Scheme: "https" }) return false;
        var segments = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return segments.Length == 2 && segments[0] == "r" && IsResultToken(segments[1]) && string.IsNullOrEmpty(uri.Fragment);
    }

    private static bool IsResultToken(string value) => value.Length is >= 8 and <= 128 && value.All(c => char.IsLetterOrDigit(c) || c is '-' or '_');
}

public sealed record MediaOutputDescriptor(string Kind, string Path, long SizeBytes, string Sha256, string Format);
