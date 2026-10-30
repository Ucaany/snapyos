using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace SnapyOS.Booth.Core.Sync;

/// <summary>
/// Sync worker — padanan <c>runtime/sync/worker.ts</c>.
///
/// Booth harus tetap jualan saat internet mati, jadi sesi ditutup lokal lebih
/// dulu lalu dikirim belakangan:
///
/// 1. <c>POST /api/v1/public/:slug/sessions</c> — buat sesi cloud, simpan
///    <c>cloud_id</c> SEGERA. Crash setelah langkah ini tidak boleh menghasilkan
///    sesi kedua.
/// 2. <c>POST .../sessions/:cloud_id/finalize</c> — foto dari disk. Cloud
///    menjawab hasil yang sama untuk sesi <c>completed</c>, jadi ulangan aman.
/// 3. Tandai <c>synced_at</c>.
///
/// <c>410</c>/<c>SESSION_EXPIRED</c> = cloud menolak permanen. Media disalin ke
/// <c>data/quarantine/</c> SEBELUM baris lokal dihapus.
/// </summary>
public sealed class SyncWorker
{
    public const long MaxBackoffMs = 5 * 60_000;
    public const long BaseBackoffMs = 1_000;
    public const int DefaultSyncIntervalMs = 15_000;

    private readonly Store _store;
    private readonly RuntimeConfig _config;
    private readonly HttpClient _http;
    private readonly Func<DateTimeOffset> _now;
    private readonly Func<double> _random;
    private readonly Action<string>? _log;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _lastPushed;
    private CancellationTokenSource? _cts;

    public SyncWorker(
        Store store,
        RuntimeConfig config,
        HttpClient? http = null,
        Func<DateTimeOffset>? now = null,
        Func<double>? random = null,
        Action<string>? log = null)
    {
        _store = store;
        _config = config;
        _http = http ?? new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        _now = now ?? (() => DateTimeOffset.UtcNow);
        _random = random ?? Random.Shared.NextDouble;
        _log = log;
    }

    public bool CanSync => _config.CloudUrl.Length > 0 && _config.DeviceToken.Length > 0;

    /// <summary><c>min(2^n × 1 s, 5 m)</c> ± 20 %. <c>n</c> = percobaan gagal.</summary>
    public long BackoffDelay(int attempt)
    {
        var safeAttempt = attempt < 0 ? 0 : attempt;
        // 2^20 × 1 s sudah jauh melewati cap; jepit eksponen supaya tidak overflow.
        var exponential = BaseBackoffMs * (1L << Math.Min(safeAttempt, 20));
        var baseDelay = Math.Min(exponential, MaxBackoffMs);
        var jitter = 0.8 + 0.4 * _random();
        return (long)Math.Round(baseDelay * jitter);
    }

    /// <summary>Kunci idempotensi: satu sesi lokal hanya boleh menjadi satu sesi cloud.</summary>
    public static string IdempotencyKey(string photoboxSlug, string sessionId) =>
        $"{photoboxSlug}:{sessionId}";

    public void Start(int? intervalMs = null)
    {
        if (!CanSync)
        {
            Log("SNAPYOS_CLOUD_URL / SNAPYOS_DEVICE_TOKEN kosong — sesi hanya tersimpan lokal.");
            return;
        }
        _cts = new CancellationTokenSource();
        var interval = intervalMs ?? DefaultSyncIntervalMs;
        _ = Task.Run(async () =>
        {
            // Putaran pertama ditunda satu interval: kamera/printer sudah harus
            // siap sebelum runtime mengurus jaringan.
            while (!_cts.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(interval, _cts.Token).ConfigureAwait(false);
                    await RunOnceAsync(_cts.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (Exception error)
                {
                    Log($"putaran sync gagal: {error.Message}");
                }
            }
        });
    }

    public void Stop()
    {
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;
    }

    public sealed record SyncReport(int Synced, int Retrying, int Quarantined, string Settings);

    /// <summary>Satu putaran: sesi yang jatuh tempo, lalu setelan.</summary>
    public async Task<SyncReport> RunOnceAsync(CancellationToken cancellationToken)
    {
        if (!CanSync)
        {
            return new SyncReport(0, 0, 0, "skipped");
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var synced = 0;
            var retrying = 0;
            var quarantined = 0;

            foreach (var queue in DueSessions())
            {
                string outcome;
                try
                {
                    outcome = await SyncSessionAsync(queue, cancellationToken).ConfigureAwait(false);
                }
                catch (Exception error)
                {
                    // Jaringan putus di tengah jalan: tetap di antrean.
                    ScheduleRetry(queue, error.Message);
                    outcome = "retry";
                }

                switch (outcome)
                {
                    case "synced":
                        synced += 1;
                        break;
                    case "retry":
                        retrying += 1;
                        break;
                    case "quarantined":
                        quarantined += 1;
                        break;
                }
            }

            var settings = await PushSettingsAsync(cancellationToken).ConfigureAwait(false);
            return new SyncReport(synced, retrying, quarantined, settings);
        }
        finally
        {
            _gate.Release();
        }
    }

    private List<QueueRow> DueSessions()
    {
        var rows = new List<QueueRow>();
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            """
            select q.session_id, q.payload_path, q.attempts, q.next_attempt_at
              from finalize_queue q
              join sessions s on s.id = q.session_id
             where s.synced_at is null
               and s.state = 'finalized'
               and q.next_attempt_at <= $now
             order by q.created_at asc
            """;
        command.Parameters.AddWithValue("$now", IsoTime.From(_now()));
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new QueueRow(reader.GetString(0), reader.GetString(1), reader.GetInt32(2), reader.GetString(3)));
        }
        return rows;
    }

    private async Task<string> SyncSessionAsync(QueueRow queue, CancellationToken cancellationToken)
    {
        var session = LoadSession(queue.SessionId);
        if (session is null || session.SyncedAt is not null)
        {
            return "skipped";
        }

        var payload = ReadPayload(queue.PayloadPath);
        if (payload is null)
        {
            ScheduleRetry(queue, "payload finalize tidak terbaca");
            return "retry";
        }

        var cloudId = session.CloudId;
        if (string.IsNullOrEmpty(cloudId))
        {
            var created = await CreateCloudSessionAsync(session, cancellationToken).ConfigureAwait(false);
            if (!created.Ok)
            {
                if (created.Expired)
                {
                    Quarantine(session, queue.PayloadPath);
                    return "quarantined";
                }
                ScheduleRetry(queue, $"create {created.Status} {created.Code}".Trim());
                return "retry";
            }
            if (string.IsNullOrEmpty(created.SessionId))
            {
                ScheduleRetry(queue, "create tidak mengembalikan session_id");
                return "retry";
            }
            cloudId = created.SessionId;
            // Simpan segera: crash setelah titik ini tidak boleh membuat sesi kedua.
            using var update = _store.Connection.CreateCommand();
            update.CommandText = "update sessions set cloud_id = $cloud, updated_at = $at where id = $id";
            update.Parameters.AddWithValue("$cloud", cloudId);
            update.Parameters.AddWithValue("$at", IsoTime.From(_now()));
            update.Parameters.AddWithValue("$id", session.Id);
            update.ExecuteNonQuery();
        }

        var finalized = await FinalizeCloudSessionAsync(session, cloudId, payload, cancellationToken)
            .ConfigureAwait(false);
        if (!finalized.Ok)
        {
            if (finalized.Expired)
            {
                Quarantine(session, queue.PayloadPath);
                return "quarantined";
            }
            ScheduleRetry(queue, $"finalize {finalized.Status} {finalized.Code}".Trim());
            return "retry";
        }

        var at = IsoTime.From(_now());
        using (var mark = _store.Connection.CreateCommand())
        {
            mark.CommandText = "update sessions set synced_at = $at, updated_at = $at where id = $id";
            mark.Parameters.AddWithValue("$at", at);
            mark.Parameters.AddWithValue("$id", session.Id);
            mark.ExecuteNonQuery();
        }
        using (var reset = _store.Connection.CreateCommand())
        {
            reset.CommandText = "update finalize_queue set attempts = 0, last_error = null where session_id = $id";
            reset.Parameters.AddWithValue("$id", session.Id);
            reset.ExecuteNonQuery();
        }
        return "synced";
    }

    private sealed record CloudAnswer(bool Ok, int Status, string? Code, string? SessionId, bool Expired);

    private async Task<CloudAnswer> CreateCloudSessionAsync(SyncSessionRow session, CancellationToken cancellationToken)
    {
        var url = $"{CloudBase}/api/v1/public/{session.BusinessSlug}/sessions";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.TryAddWithoutValidation("Idempotency-Key", IdempotencyKey(session.PhotoboxSlug, session.Id));
        request.Content = new StringContent(
            new JsonObject
            {
                ["package_id"] = session.PackageId,
                ["client_created_at"] = session.ClientCreatedAt,
                ["device_token"] = _config.DeviceToken,
            }.ToJsonString(),
            Encoding.UTF8,
            "application/json");

        return await SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    private async Task<CloudAnswer> FinalizeCloudSessionAsync(
        SyncSessionRow session,
        string cloudId,
        FinalizePayload payload,
        CancellationToken cancellationToken)
    {
        var url = $"{CloudBase}/api/v1/public/{session.BusinessSlug}/sessions/{cloudId}/finalize";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        var form = new MultipartFormDataContent
        {
            { new StringContent(_config.DeviceToken), "device_token" },
            { new StringContent((payload.RetakeCount ?? session.RetakeCount).ToString()), "retake_count" },
        };
        var templateId = payload.TemplateId ?? session.TemplateId;
        if (!string.IsNullOrEmpty(templateId))
        {
            form.Add(new StringContent(templateId), "template_id");
        }
        foreach (var file in payload.Photos)
        {
            form.Add(FileContent(file, "photo.jpg"), "photos", "photo.jpg");
        }
        foreach (var file in payload.GifPhotos)
        {
            form.Add(FileContent(file, "gif-photo.jpg"), "gif_photos", "gif-photo.jpg");
        }
        request.Content = form;

        return await SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    private static ByteArrayContent FileContent(string path, string fileName)
    {
        var content = new ByteArrayContent(File.ReadAllBytes(path));
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return content;
    }

    private async Task<CloudAnswer> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        string? code = null;
        string? sessionId = null;
        try
        {
            if (JsonNode.Parse(text) is JsonObject body)
            {
                code = body["error"]?["code"]?.GetValue<string>();
                sessionId = body["data"]?["session_id"]?.GetValue<string>();
            }
        }
        catch (System.Text.Json.JsonException)
        {
            // Body bukan JSON: status saja yang dipakai.
        }
        var expired = (int)response.StatusCode == 410 || code == "SESSION_EXPIRED";
        return new CloudAnswer(response.IsSuccessStatusCode, (int)response.StatusCode, code, sessionId, expired);
    }

    /// <summary>
    /// Salin media sesi ke karantina, lalu hapus baris lokal. Salinan SELALU
    /// didahulukan: kalau penyalinan gagal, baris tetap ada dan sync dicoba lagi.
    /// </summary>
    private void Quarantine(SyncSessionRow session, string payloadPath)
    {
        var payload = ReadPayload(payloadPath);
        var dir = Path.Combine(_config.DataDir, "quarantine", session.Id);
        Directory.CreateDirectory(dir);

        var files = (payload?.Photos ?? []).Concat(payload?.GifPhotos ?? []).ToList();
        foreach (var file in files)
        {
            var target = Path.Combine(dir, Path.GetFileName(file));
            File.Copy(file, target, overwrite: true);
        }
        File.Copy(payloadPath, Path.Combine(dir, "finalize.json"), overwrite: true);

        using (var delete = _store.Connection.CreateCommand())
        {
            delete.CommandText = "delete from sessions where id = $id";
            delete.Parameters.AddWithValue("$id", session.Id);
            delete.ExecuteNonQuery();
        }
        _store.InsertEvent("session_quarantined", session.Id, new JsonObject
        {
            ["reason"] = "SESSION_EXPIRED",
            ["files"] = files.Count,
            ["dir"] = dir,
        });
        Log($"sesi {session.Id} kedaluwarsa di cloud; media disalin ke {dir}");
    }

    private async Task<string> PushSettingsAsync(CancellationToken cancellationToken)
    {
        if (!CanSync)
        {
            return "skipped";
        }
        // appearance_settings sengaja dibuang: kustomisasi tampilan milik satu booth.
        var settings = new SettingsService(_store, _config).CloudSyncedSettings(
            new SettingsService(_store, _config).ActiveSettings());
        var serialized = settings.ToJsonString();
        if (serialized == _lastPushed)
        {
            return "unchanged";
        }

        using var request = new HttpRequestMessage(HttpMethod.Patch, $"{CloudBase}/api/v1/public/devices/settings");
        request.Content = new StringContent(
            new JsonObject
            {
                ["device_token"] = _config.DeviceToken,
                ["app_version"] = VersionInfo.Version,
                ["settings"] = settings.DeepClone(),
            }.ToJsonString(),
            Encoding.UTF8,
            "application/json");

        try
        {
            var answer = await SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (!answer.Ok)
            {
                Log($"tulis balik setelan ditolak: {answer.Status} {answer.Code}".Trim());
                return "failed";
            }
            _lastPushed = serialized;
            return "pushed";
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            return "failed";
        }
    }

    private void ScheduleRetry(QueueRow queue, string message)
    {
        var attempts = queue.Attempts + 1;
        var next = IsoTime.From(_now().AddMilliseconds(BackoffDelay(attempts)));
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            "update finalize_queue set attempts = $attempts, next_attempt_at = $next, last_error = $error " +
            "where session_id = $id";
        command.Parameters.AddWithValue("$attempts", attempts);
        command.Parameters.AddWithValue("$next", next);
        command.Parameters.AddWithValue("$error", message.Length > 500 ? message[..500] : message);
        command.Parameters.AddWithValue("$id", queue.SessionId);
        command.ExecuteNonQuery();
    }

    private SyncSessionRow? LoadSession(string id)
    {
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            "select id, cloud_id, business_slug, photobox_slug, package_id, template_id, retake_count, " +
            "client_created_at, state, synced_at from sessions where id = $id";
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }
        return new SyncSessionRow(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetInt32(6),
            reader.GetString(7),
            reader.GetString(8),
            reader.IsDBNull(9) ? null : reader.GetString(9));
    }

    private static FinalizePayload? ReadPayload(string path)
    {
        try
        {
            if (JsonNode.Parse(File.ReadAllText(path)) is not JsonObject obj)
            {
                return null;
            }
            return new FinalizePayload(
                ReadStringArray(obj["photos"]),
                ReadStringArray(obj["gif_photos"]),
                obj["retake_count"] is JsonValue retake && retake.TryGetValue(out int value) ? value : null,
                obj["template_id"] is JsonValue template && template.TryGetValue(out string? tmpl) ? tmpl : null);
        }
        catch (Exception error) when (error is IOException or System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private static List<string> ReadStringArray(JsonNode? node)
    {
        var list = new List<string>();
        if (node is JsonArray array)
        {
            foreach (var item in array)
            {
                if (item is JsonValue value && value.TryGetValue(out string? text) && text is not null)
                {
                    list.Add(text);
                }
            }
        }
        return list;
    }

    private string CloudBase => _config.CloudUrl.TrimEnd('/');

    private void Log(string message) => (_log ?? Console.Error.WriteLine)($"[snapyos-sync] {message}");

    private sealed record QueueRow(string SessionId, string PayloadPath, int Attempts, string NextAttemptAt);

    private sealed record FinalizePayload(
        List<string> Photos,
        List<string> GifPhotos,
        int? RetakeCount,
        string? TemplateId);

    private sealed record SyncSessionRow(
        string Id,
        string? CloudId,
        string BusinessSlug,
        string PhotoboxSlug,
        string PackageId,
        string? TemplateId,
        int RetakeCount,
        string ClientCreatedAt,
        string State,
        string? SyncedAt);
}
