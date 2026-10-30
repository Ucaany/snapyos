using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace SnapyOS.Booth.Core.Sessions;

/// <summary>Bagian multipart: <c>name</c>, <c>filename</c> (null bila field), dan data mentah.</summary>
public sealed record MultipartPart(string Name, string? FileName, byte[] Data);

/// <summary>
/// Parser <c>multipart/form-data</c> secukupnya untuk kontrak finalize —
/// padanan <c>parseMultipart</c> di <c>runtime/session/index.ts</c>. Hanya
/// <c>name</c>, <c>filename</c>, dan isi biner yang dibutuhkan; body sudah
/// dibatasi sebelum sampai di sini.
/// </summary>
public static class MultipartParser
{
    public static List<MultipartPart> Parse(byte[] body, string contentType)
    {
        var boundary = ExtractBoundary(contentType);
        if (string.IsNullOrEmpty(boundary))
        {
            throw new BridgeException("Multipart tanpa boundary.", 400);
        }

        var delimiter = Encoding.ASCII.GetBytes($"--{boundary}");
        var parts = new List<MultipartPart>();
        var cursor = IndexOf(body, delimiter, 0);
        if (cursor < 0)
        {
            throw new BridgeException("Multipart tidak valid.", 400);
        }

        while (cursor >= 0)
        {
            var start = cursor + delimiter.Length;
            if (Matches(body, start, "--"u8))
            {
                break;
            }
            if (Matches(body, start, "\r\n"u8))
            {
                start += 2;
            }
            var next = IndexOf(body, delimiter, start);
            if (next < 0)
            {
                break;
            }
            var chunk = body[(start)..(next - 2)]; // buang CRLF sebelum delimiter
            var headerEnd = IndexOf(chunk, "\r\n\r\n"u8, 0);
            if (headerEnd >= 0)
            {
                var headers = Encoding.UTF8.GetString(chunk, 0, headerEnd);
                var name = MatchQuoted(headers, "name") ?? string.Empty;
                var fileName = MatchQuoted(headers, "filename");
                if (name.Length > 0)
                {
                    parts.Add(new MultipartPart(name, fileName, chunk[(headerEnd + 4)..]));
                }
            }
            cursor = next;
        }
        return parts;
    }

    private static string ExtractBoundary(string contentType)
    {
        var marker = contentType.IndexOf("boundary=", StringComparison.OrdinalIgnoreCase);
        if (marker < 0)
        {
            return string.Empty;
        }
        var value = contentType[(marker + "boundary=".Length)..].Trim();
        if (value.StartsWith('"'))
        {
            var end = value.IndexOf('"', 1);
            return end > 0 ? value[1..end].Trim() : string.Empty;
        }
        var semicolon = value.IndexOf(';');
        return (semicolon >= 0 ? value[..semicolon] : value).Trim();
    }

    private static string? MatchQuoted(string headers, string key)
    {
        var token = $"{key}=\"";
        var at = headers.IndexOf(token, StringComparison.OrdinalIgnoreCase);
        if (at < 0)
        {
            return null;
        }
        var start = at + token.Length;
        var end = headers.IndexOf('"', start);
        return end < 0 ? null : headers[start..end];
    }

    private static int IndexOf(byte[] haystack, ReadOnlySpan<byte> needle, int from)
    {
        for (var i = from; i <= haystack.Length - needle.Length; i += 1)
        {
            if (Matches(haystack, i, needle))
            {
                return i;
            }
        }
        return -1;
    }

    private static bool Matches(byte[] haystack, int at, ReadOnlySpan<byte> needle)
    {
        if (at + needle.Length > haystack.Length)
        {
            return false;
        }
        for (var i = 0; i < needle.Length; i += 1)
        {
            if (haystack[at + i] != needle[i])
            {
                return false;
            }
        }
        return true;
    }
}

/// <summary>
/// Endpoint sesi lokal (<c>/v1/sessions*</c>) — padanan
/// <c>runtime/session/index.ts</c>.
///
/// Runtime ini pemilik kamera fisik, jadi capture ditulis ke disk di sini dan
/// bukan di kiosk. Semua sesi berprefix <c>local_</c>: ID cloud adalah UUID, dan
/// mencampur keduanya akan membuat sync worker mengirim balik sesi yang sudah
/// ada di cloud.
/// </summary>
public sealed class SessionsService
{
    public const string LocalSessionPrefix = "local_";

    private readonly Store _store;
    private readonly string _mediaDir;
    private readonly Func<CancellationToken, Task<byte[]>> _capture;
    private readonly Func<DateTimeOffset> _now;

    public SessionsService(
        Store store,
        string mediaDir,
        Func<CancellationToken, Task<byte[]>> capture,
        Func<DateTimeOffset>? now = null)
    {
        _store = store;
        _mediaDir = mediaDir;
        _capture = capture;
        _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    public static string NewSessionId(DateTimeOffset now)
    {
        var stamp = ((long)now.ToUnixTimeMilliseconds()).ToString("x");
        return $"{LocalSessionPrefix}{stamp}{RandomSuffix()}";
    }

    private static string RandomSuffix()
    {
        const string alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
        Span<char> buffer = stackalloc char[8];
        for (var i = 0; i < buffer.Length; i += 1)
        {
            buffer[i] = alphabet[Random.Shared.Next(alphabet.Length)];
        }
        return new string(buffer);
    }

    private static bool IsLocalId(string id) => id.StartsWith(LocalSessionPrefix, StringComparison.Ordinal);

    // --- payload parsing ---

    private static JsonObject AsObject(JsonNode? body)
    {
        if (body is not JsonObject obj)
        {
            throw new BridgeException("Payload harus objek JSON.", 400);
        }
        return obj;
    }

    private static string? OptionalString(JsonNode? value, string name)
    {
        if (value is null)
        {
            return null;
        }
        if (value is JsonValue scalar && scalar.TryGetValue(out string? text))
        {
            return string.IsNullOrEmpty(text) ? null : text;
        }
        throw new BridgeException($"{name} harus teks.", 400);
    }

    private static int SlotOf(JsonNode? value)
    {
        if (value is null)
        {
            return 0;
        }
        if (value is JsonValue scalar && scalar.TryGetValue(out int slot) && slot >= 0 && slot <= 99)
        {
            return slot;
        }
        throw new BridgeException("slot_index harus bilangan bulat 0-99.", 400);
    }

    // --- create ---

    /// <summary>POST /v1/sessions</summary>
    public BridgeResponse CreateSession(JsonNode? raw)
    {
        var body = AsObject(raw);
        var snapshot = body["package_snapshot"];
        if (snapshot is not JsonObject snapshotObject)
        {
            throw new BridgeException("package_snapshot wajib diisi.", 400);
        }

        var packageId =
            OptionalString(body["package_id"], "package_id")
            ?? OptionalString(snapshotObject["package_id"], "package_snapshot.package_id")
            ?? OptionalString(snapshotObject["id"], "package_snapshot.id");
        if (packageId is null)
        {
            throw new BridgeException("package_id wajib diisi.", 400);
        }

        var businessSlug = OptionalString(body["business_slug"], "business_slug") ?? _store.GetMeta("business_slug");
        var photoboxSlug = OptionalString(body["photobox_slug"], "photobox_slug") ?? _store.GetMeta("photobox_slug");
        if (string.IsNullOrEmpty(businessSlug) || string.IsNullOrEmpty(photoboxSlug))
        {
            throw new BridgeException("Runtime belum dikonfigurasi (business_slug/photobox_slug kosong).", 409);
        }

        var now = _now();
        var timerSeconds = body["timer_seconds"] is JsonValue timerScalar && timerScalar.TryGetValue(out int timer)
            ? timer
            : 0;
        var id = NewSessionId(now);
        InsertSession(
            new NewSession(
                id,
                businessSlug,
                photoboxSlug,
                packageId,
                OptionalString(body["template_id"], "template_id"),
                snapshotObject.DeepClone(),
                OptionalString(body["payment_method"], "payment_method"),
                timerSeconds,
                OptionalString(body["client_created_at"], "client_created_at")),
            now);

        return new BridgeResponse(201, Present(RequireSession(id)));
    }

    private void InsertSession(NewSession input, DateTimeOffset now)
    {
        var at = IsoTime.From(now);
        var expiresAt = SessionTimer.ComputeExpiresAt(input.TimerSeconds, now);
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            """
            insert into sessions (
              id, cloud_id, business_slug, photobox_slug, package_id, template_id, state,
              expires_at, retake_count, package_snapshot_json, payment_method,
              client_created_at, synced_at, created_at, updated_at
            ) values ($id, null, $business, $photobox, $package, $template, 'active',
                      $expires, 0, $snapshot, $payment, $clientAt, null, $at, $at)
            """;
        command.Parameters.AddWithValue("$id", input.Id);
        command.Parameters.AddWithValue("$business", input.BusinessSlug);
        command.Parameters.AddWithValue("$photobox", input.PhotoboxSlug);
        command.Parameters.AddWithValue("$package", input.PackageId);
        command.Parameters.AddWithValue("$template", (object?)input.TemplateId ?? DBNull.Value);
        command.Parameters.AddWithValue("$expires", expiresAt);
        command.Parameters.AddWithValue("$snapshot", input.PackageSnapshot.ToJsonString());
        command.Parameters.AddWithValue("$payment", (object?)input.PaymentMethod ?? DBNull.Value);
        command.Parameters.AddWithValue("$clientAt", input.ClientCreatedAt ?? at);
        command.Parameters.AddWithValue("$at", at);
        command.ExecuteNonQuery();
    }

    public readonly record struct NewSession(
        string Id,
        string BusinessSlug,
        string PhotoboxSlug,
        string PackageId,
        string? TemplateId,
        JsonNode PackageSnapshot,
        string? PaymentMethod,
        int TimerSeconds,
        string? ClientCreatedAt);

    // --- read ---

    /// <summary>GET /v1/sessions/:id</summary>
    public BridgeResponse ReadSession(string id)
    {
        var row = RequireSession(id);
        return new BridgeResponse(200, Present(row, ListCaptures(id)));
    }

    // --- capture ---

    /// <summary>
    /// POST /v1/sessions/:id/capture.
    ///
    /// <c>Idempotency-Key</c> wajib: kiosk mengulang request saat jaringan putus,
    /// dan dua baris untuk satu slot berarti dua foto tertagih. Key yang sama
    /// selalu mengembalikan capture yang sama, bukan menulis ulang file.
    /// </summary>
    public async Task<BridgeResponse> CaptureSlotAsync(
        string id,
        string? idempotencyKey,
        JsonNode? raw,
        CancellationToken cancellationToken)
    {
        var key = idempotencyKey?.Trim();
        if (string.IsNullOrEmpty(key))
        {
            throw new BridgeException("Header Idempotency-Key wajib dikirim.", 400);
        }

        var row = RequireSession(id);
        var body = raw is null ? new JsonObject() : AsObject(raw);
        var slot = SlotOf(body["slot_index"]);

        var existing = FindCaptureByKey(id, key);
        if (existing is not null)
        {
            return new BridgeResponse(200, CaptureReplay(existing));
        }

        RequireActive(row);

        // Slot sudah terisi dengan key lain: jangan buang satu shutter hanya untuk
        // menemukan konflik di insert. Insert di bawah tetap penjaga balapan.
        var occupiedBefore = FindCaptureBySlot(id, slot);
        if (occupiedBefore is not null)
        {
            return new BridgeResponse(200, CaptureReplay(occupiedBefore));
        }

        var at = IsoTime.From(_now());
        var dir = MediaDirFor(id);
        var filePath = Path.Combine(dir, $"{slot}.jpg");
        var captureId = $"cap_{Guid.NewGuid()}";
        var buffer = await _capture(cancellationToken).ConfigureAwait(false);

        try
        {
            using var command = _store.Connection.CreateCommand();
            command.CommandText =
                "insert into captures (id, session_id, slot_index, file_path, created_at, idempotency_key) " +
                "values ($id, $session, $slot, $path, $at, $key)";
            command.Parameters.AddWithValue("$id", captureId);
            command.Parameters.AddWithValue("$session", id);
            command.Parameters.AddWithValue("$slot", slot);
            command.Parameters.AddWithValue("$path", filePath);
            command.Parameters.AddWithValue("$at", at);
            command.Parameters.AddWithValue("$key", key);
            command.ExecuteNonQuery();
        }
        catch (SqliteException)
        {
            // Slot sudah terisi (key berbeda, slot sama): kirim baris yang ada.
            var occupied = FindCaptureBySlot(id, slot);
            if (occupied is not null)
            {
                return new BridgeResponse(200, CaptureReplay(occupied));
            }
            throw;
        }

        try
        {
            await File.WriteAllBytesAsync(filePath, buffer, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            // Disk gagal: hapus baris supaya retry dengan key yang sama benar-benar
            // menulis file, bukan mengembalikan capture tanpa file.
            using var delete = _store.Connection.CreateCommand();
            delete.CommandText = "delete from captures where id = $id";
            delete.Parameters.AddWithValue("$id", captureId);
            delete.ExecuteNonQuery();
            throw;
        }

        Touch(id, at);
        return new BridgeResponse(201, new JsonObject
        {
            ["ok"] = true,
            ["capture"] = new JsonObject
            {
                ["id"] = captureId,
                ["slot_index"] = slot,
                ["created_at"] = at,
            },
        });
    }

    private static JsonObject CaptureReplay(CaptureRow capture) => new()
    {
        ["ok"] = true,
        ["replay"] = true,
        ["capture"] = new JsonObject
        {
            ["id"] = capture.Id,
            ["slot_index"] = capture.SlotIndex,
            ["file_path"] = capture.FilePath,
            ["created_at"] = capture.CreatedAt,
        },
    };

    // --- finalize ---

    /// <summary>POST /v1/sessions/:id/finalize — field sama dengan <c>buildFinalizeForm</c>.</summary>
    public BridgeResponse FinalizeSession(string id, List<MultipartPart> parts)
    {
        var row = RequireSession(id);
        if (FinalizeQueueExists(id))
        {
            return new BridgeResponse(200, new JsonObject
            {
                ["ok"] = true,
                ["replay"] = true,
                ["session"] = Present(RequireSession(id)),
            });
        }
        RequireActive(row);

        var dir = MediaDirFor(id);
        var fields = new Dictionary<string, string>(StringComparer.Ordinal);
        var photos = new List<string>();
        var gifPhotos = new List<string>();

        foreach (var part in parts)
        {
            if (part.Name is "photos" or "gif_photos")
            {
                var list = part.Name == "photos" ? photos : gifPhotos;
                var file = Path.Combine(dir, $"final-{list.Count}.jpg");
                File.WriteAllBytes(file, part.Data);
                list.Add(file);
                continue;
            }
            if (part.FileName is null)
            {
                fields[part.Name] = Encoding.UTF8.GetString(part.Data);
            }
        }

        if (photos.Count == 0)
        {
            throw new BridgeException("Minimal satu foto wajib diunggah.", 400);
        }

        var at = IsoTime.From(_now());
        var retakeCount = fields.TryGetValue("retake_count", out var raw) && int.TryParse(raw, out var parsed)
            ? parsed
            : 0;
        var templateId = fields.TryGetValue("template_id", out var tmpl) ? tmpl : null;

        var payloadPath = Path.Combine(dir, "finalize.json");
        var payload = new JsonObject
        {
            ["session_id"] = id,
            ["retake_count"] = retakeCount,
            ["template_id"] = templateId,
            ["photos"] = new JsonArray(photos.Select((path) => (JsonNode)JsonValue.Create(path)!).ToArray()),
            ["gif_photos"] = new JsonArray(gifPhotos.Select((path) => (JsonNode)JsonValue.Create(path)!).ToArray()),
            ["finalized_at"] = at,
        };
        File.WriteAllText(payloadPath, payload.ToJsonString(new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
        }));

        using (var queue = _store.Connection.CreateCommand())
        {
            queue.CommandText =
                "insert into finalize_queue (id, session_id, payload_path, attempts, next_attempt_at, last_error, created_at) " +
                "values ($id, $session, $path, 0, $at, null, $at)";
            queue.Parameters.AddWithValue("$id", $"fq_{id}");
            queue.Parameters.AddWithValue("$session", id);
            queue.Parameters.AddWithValue("$path", payloadPath);
            queue.Parameters.AddWithValue("$at", at);
            queue.ExecuteNonQuery();
        }
        using (var update = _store.Connection.CreateCommand())
        {
            update.CommandText =
                "update sessions set state = 'finalized', retake_count = $retake, updated_at = $at where id = $id";
            update.Parameters.AddWithValue("$retake", retakeCount);
            update.Parameters.AddWithValue("$at", at);
            update.Parameters.AddWithValue("$id", id);
            update.ExecuteNonQuery();
        }

        return new BridgeResponse(200, new JsonObject
        {
            ["ok"] = true,
            ["session"] = Present(RequireSession(id)),
            ["photos"] = photos.Count,
        });
    }

    // --- abort ---

    /// <summary>POST /v1/sessions/:id/abort</summary>
    public BridgeResponse AbortSession(string id)
    {
        var row = RequireSession(id);
        if (row.State == "aborted")
        {
            return new BridgeResponse(200, new JsonObject
            {
                ["ok"] = true,
                ["replay"] = true,
                ["session"] = Present(row),
            });
        }
        RequireActive(row);
        using var command = _store.Connection.CreateCommand();
        command.CommandText = "update sessions set state = 'aborted', updated_at = $at where id = $id";
        command.Parameters.AddWithValue("$at", IsoTime.From(_now()));
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
        return new BridgeResponse(200, new JsonObject
        {
            ["ok"] = true,
            ["session"] = Present(RequireSession(id)),
        });
    }

    // --- helpers ---

    private string MediaDirFor(string sessionId)
    {
        var dir = Path.Combine(_mediaDir, sessionId);
        Directory.CreateDirectory(dir);
        return dir;
    }

    private void Touch(string id, string at)
    {
        using var command = _store.Connection.CreateCommand();
        command.CommandText = "update sessions set updated_at = $at where id = $id";
        command.Parameters.AddWithValue("$at", at);
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
    }

    private SessionRow RequireSession(string id)
    {
        if (!IsLocalId(id))
        {
            throw new BridgeException("Sesi lokal tidak ditemukan.", 404);
        }
        return FindSession(id) ?? throw new BridgeException("Sesi lokal tidak ditemukan.", 404);
    }

    private static void RequireActive(SessionRow row)
    {
        if (row.State != "active")
        {
            var label = row.State == "finalized" ? "final" : "dibatalkan";
            throw new BridgeException($"Sesi sudah {label}.", 409);
        }
    }

    private SessionRow? FindSession(string id)
    {
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            "select id, cloud_id, business_slug, photobox_slug, package_id, template_id, state, " +
            "expires_at, retake_count, package_snapshot_json, payment_method, client_created_at, " +
            "synced_at, created_at, updated_at from sessions where id = $id";
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }
        return new SessionRow(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetString(6),
            reader.GetString(7),
            reader.GetInt32(8),
            reader.GetString(9),
            reader.IsDBNull(10) ? null : reader.GetString(10),
            reader.GetString(11),
            reader.IsDBNull(12) ? null : reader.GetString(12),
            reader.GetString(13),
            reader.GetString(14));
    }

    private List<CaptureRow> ListCaptures(string sessionId)
    {
        var captures = new List<CaptureRow>();
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            "select id, slot_index, file_path, created_at from captures where session_id = $id order by slot_index";
        command.Parameters.AddWithValue("$id", sessionId);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            captures.Add(new CaptureRow(reader.GetString(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3)));
        }
        return captures;
    }

    private CaptureRow? FindCaptureByKey(string sessionId, string key)
    {
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            "select id, slot_index, file_path, created_at from captures " +
            "where session_id = $id and idempotency_key = $key";
        command.Parameters.AddWithValue("$id", sessionId);
        command.Parameters.AddWithValue("$key", key);
        return ReadCapture(command);
    }

    private CaptureRow? FindCaptureBySlot(string sessionId, int slot)
    {
        using var command = _store.Connection.CreateCommand();
        command.CommandText =
            "select id, slot_index, file_path, created_at from captures " +
            "where session_id = $id and slot_index = $slot";
        command.Parameters.AddWithValue("$id", sessionId);
        command.Parameters.AddWithValue("$slot", slot);
        return ReadCapture(command);
    }

    private static CaptureRow? ReadCapture(SqliteCommand command)
    {
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }
        return new CaptureRow(reader.GetString(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3));
    }

    private bool FinalizeQueueExists(string sessionId)
    {
        using var command = _store.Connection.CreateCommand();
        command.CommandText = "select 1 from finalize_queue where session_id = $id";
        command.Parameters.AddWithValue("$id", sessionId);
        return command.ExecuteScalar() is not null;
    }

    private JsonObject Present(SessionRow row, List<CaptureRow>? captures = null)
    {
        var captureArray = new JsonArray();
        foreach (var capture in captures ?? [])
        {
            captureArray.Add(new JsonObject
            {
                ["id"] = capture.Id,
                ["slot_index"] = capture.SlotIndex,
                ["created_at"] = capture.CreatedAt,
            });
        }

        return new JsonObject
        {
            ["id"] = row.Id,
            ["cloud_id"] = row.CloudId,
            ["business_slug"] = row.BusinessSlug,
            ["photobox_slug"] = row.PhotoboxSlug,
            ["package_id"] = row.PackageId,
            ["template_id"] = row.TemplateId,
            ["state"] = row.State,
            ["expires_at"] = row.ExpiresAt,
            ["retake_count"] = row.RetakeCount,
            ["package_snapshot"] = SafeParse(row.PackageSnapshotJson),
            ["payment_method"] = row.PaymentMethod,
            ["client_created_at"] = row.ClientCreatedAt,
            ["synced_at"] = row.SyncedAt,
            ["created_at"] = row.CreatedAt,
            ["updated_at"] = row.UpdatedAt,
            ["captures"] = captureArray,
        };
    }

    private static JsonNode? SafeParse(string raw)
    {
        try
        {
            return JsonNode.Parse(raw);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private sealed record SessionRow(
        string Id,
        string? CloudId,
        string BusinessSlug,
        string PhotoboxSlug,
        string PackageId,
        string? TemplateId,
        string State,
        string ExpiresAt,
        int RetakeCount,
        string PackageSnapshotJson,
        string? PaymentMethod,
        string ClientCreatedAt,
        string? SyncedAt,
        string CreatedAt,
        string UpdatedAt);

    private sealed record CaptureRow(string Id, int SlotIndex, string FilePath, string CreatedAt);
}
