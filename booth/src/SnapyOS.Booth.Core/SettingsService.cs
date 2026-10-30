using System.Text.Json.Nodes;
using SnapyOS.Booth.Core.Contracts;

namespace SnapyOS.Booth.Core;

/// <summary>
/// Setelan device: baca, tulis, export, import. Padanan
/// <c>runtime/settings/index.ts</c>.
///
/// Yang berhubungan dengan uang milik cloud, yang berhubungan dengan mesin milik
/// booth. <c>Put</c> hanya menerima field device; field cloud dijawab
/// <c>403 FIELD_NOT_DEVICE_OWNED</c>, bukan dibuang diam-diam.
/// </summary>
public sealed class SettingsService
{
    public const string FieldNotDeviceOwned = SettingErrorCodes.FieldNotDeviceOwned;
    public const string InvalidSettings = SettingErrorCodes.InvalidSettings;
    public const string SchemaVersionTooNew = SettingErrorCodes.SchemaVersionTooNew;
    public const string PhotoboxMismatch = SettingErrorCodes.PhotoboxMismatch;

    private readonly Store _store;
    private readonly RuntimeConfig _config;
    private readonly Func<DateTimeOffset> _now;

    public SettingsService(Store store, RuntimeConfig config, Func<DateTimeOffset>? now = null)
    {
        _store = store;
        _config = config;
        _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    public static int SchemaVersion => SettingsContractSchema.SchemaVersion;

    /// <summary>Setelan yang tersimpan di store saja (tanpa nilai env).</summary>
    public JsonObject ReadDeviceSettings()
    {
        var result = new JsonObject();
        foreach (var group in SettingsContractSchema.Groups)
        {
            var value = StoredGroup(group);
            if (value is not null)
            {
                result[group] = value.DeepClone();
            }
        }
        return result;
    }

    /// <summary>Nilai awal dari env. <c>provider</c> menjawab siapa yang memegang shutter.</summary>
    public JsonObject DefaultsFromConfig() => new()
    {
        ["camera_settings"] = new JsonObject
        {
            ["provider"] = _config.Camera == "gphoto2" ? "gphoto2" : "browser",
        },
    };

    /// <summary>Setelan aktif: env sebagai alas, store di atasnya, per grup.</summary>
    public JsonObject ActiveSettings()
    {
        var result = DefaultsFromConfig();
        var stored = ReadDeviceSettings();
        foreach (var group in SettingsContractSchema.Groups)
        {
            if (stored[group] is not JsonObject storedGroup)
            {
                continue;
            }
            var merged = result[group] as JsonObject ?? new JsonObject();
            var combined = new JsonObject();
            foreach (var (key, value) in merged)
            {
                combined[key] = value?.DeepClone();
            }
            foreach (var (key, value) in storedGroup)
            {
                combined[key] = value?.DeepClone();
            }
            result[group] = combined;
        }
        return result;
    }

    /// <summary>Setelan yang boleh naik ke cloud — <c>appearance_settings</c> tidak ikut.</summary>
    public JsonObject CloudSyncedSettings(JsonObject settings)
    {
        var result = new JsonObject();
        foreach (var group in SettingsContractSchema.CloudSyncedGroups)
        {
            if (settings[group] is JsonNode value)
            {
                result[group] = value.DeepClone();
            }
        }
        return result;
    }

    /// <summary>Field cetak tersimpan, dipakai bila request kiosk tidak menyebutkannya.</summary>
    public JsonObject PrintDefaults(JsonObject settings)
    {
        var result = new JsonObject();
        if (settings["print_settings"] is not JsonObject print)
        {
            return result;
        }
        foreach (var key in new[] { "paper_size", "orientation", "margins_mm", "printer_name" })
        {
            if (print[key] is JsonNode value && value.GetValueKind() != System.Text.Json.JsonValueKind.Undefined)
            {
                result[key] = value.DeepClone();
            }
        }
        return result;
    }

    public BridgeResponse Read() => new(200, Present());

    public BridgeResponse Write(JsonNode? raw)
    {
        var payload = AsObject(raw, "Payload");
        var incoming = Validate(payload);
        foreach (var group in SettingsContractSchema.Groups)
        {
            if (incoming[group] is not JsonObject patch)
            {
                continue;
            }
            var merged = new JsonObject();
            if (StoredGroup(group) is JsonObject stored)
            {
                foreach (var (key, value) in stored)
                {
                    merged[key] = value?.DeepClone();
                }
            }
            foreach (var (key, value) in patch)
            {
                merged[key] = value?.DeepClone();
            }
            var issues = SettingsSchemaValidator.Validate(merged, GroupSchema(group));
            if (issues.Count > 0)
            {
                var issue = issues[0];
                throw new BridgeException(
                    $"{group}.{issue.Path}: {issue.Message}",
                    400,
                    InvalidSettings);
            }
            _store.SetSetting(group, merged);
        }
        return new BridgeResponse(200, Present());
    }

    /// <summary><c>GET /v1/settings/export</c> — tanpa <c>exit_pin</c> / PIN darurat.</summary>
    public BridgeResponse Export()
    {
        var settings = (JsonObject)StripSecrets(ReadDeviceSettings())!;
        var body = new JsonObject
        {
            ["schema_version"] = SchemaVersion,
            ["exported_at"] = _now().ToString("o"),
            ["photobox_slug"] = _store.GetMeta("photobox_slug"),
            ["business_slug"] = _store.GetMeta("business_slug"),
            ["settings"] = settings,
        };
        return new BridgeResponse(200, body);
    }

    /// <summary><c>POST /v1/settings/import</c> — menolak versi lebih baru & photobox berbeda.</summary>
    public BridgeResponse Import(JsonNode? raw)
    {
        var payload = AsObject(raw, "Berkas setelan");

        if (payload["schema_version"] is not JsonValue versionNode
            || !versionNode.TryGetValue(out int version)
            || version < 1)
        {
            throw new BridgeException(
                "schema_version wajib bilangan bulat positif.",
                400,
                InvalidSettings);
        }
        if (version > SchemaVersion)
        {
            throw new BridgeException(
                $"Versi setelan {version} lebih baru dari yang didukung ({SchemaVersion}). " +
                "Perbarui aplikasi booth lebih dulu.",
                400,
                SchemaVersionTooNew);
        }

        var currentSlug = _store.GetMeta("photobox_slug");
        var incomingSlug = payload["photobox_slug"] is JsonValue slugNode
            && slugNode.TryGetValue(out string? slug)
            ? slug?.Trim() ?? string.Empty
            : string.Empty;
        if (!string.IsNullOrEmpty(currentSlug)
            && !string.IsNullOrEmpty(incomingSlug)
            && !string.Equals(incomingSlug, currentSlug, StringComparison.Ordinal))
        {
            throw new BridgeException(
                $"Berkas ini milik booth \"{incomingSlug}\", bukan \"{currentSlug}\".",
                409,
                PhotoboxMismatch);
        }

        var settings = Validate(AsObject(payload["settings"], "settings"));
        foreach (var group in SettingsContractSchema.Groups)
        {
            if (settings[group] is JsonObject value)
            {
                _store.SetSetting(group, value);
            }
        }
        return new BridgeResponse(200, Present());
    }

    private JsonObject Present()
    {
        var active = ActiveSettings();
        var groups = new JsonObject();
        foreach (var group in SettingsContractSchema.Groups)
        {
            groups[group] = StripSecrets(active[group] as JsonObject ?? new JsonObject());
        }
        var body = new JsonObject
        {
            ["ok"] = true,
            ["photobox_slug"] = _store.GetMeta("photobox_slug"),
            ["business_slug"] = _store.GetMeta("business_slug"),
            ["settings"] = groups,
        };
        return body;
    }

    private JsonObject Validate(JsonObject payload)
    {
        var foreign = ForeignKeys(payload);
        if (foreign.Count > 0)
        {
            throw new BridgeException(
                $"Field ini milik cloud dan tidak bisa diubah dari booth: {string.Join(", ", foreign)}.",
                403,
                FieldNotDeviceOwned);
        }

        var issues = SettingsSchemaValidator.Validate(payload, SettingsContractSchema.Schema);
        if (issues.Count > 0)
        {
            var issue = issues[0];
            throw new BridgeException(
                $"{issue.Path}: {issue.Message}",
                400,
                InvalidSettings);
        }

        return (JsonObject)payload.DeepClone();
    }

    /// <summary>Field di payload yang BUKAN milik device. Kosong berarti payload boleh ditulis.</summary>
    public static List<string> ForeignKeys(JsonObject payload)
    {
        var foreign = new List<string>();
        var groups = new HashSet<string>(SettingsContractSchema.Groups, StringComparer.Ordinal);
        foreach (var (key, value) in payload)
        {
            if (!groups.Contains(key))
            {
                foreign.Add(key);
                continue;
            }
            if (value is not JsonObject nested)
            {
                continue;
            }
            var allowed = new HashSet<string>(SettingsContractSchema.DeviceWritableFields(key), StringComparer.Ordinal);
            foreach (var (nestedKey, _) in nested)
            {
                if (!allowed.Contains(nestedKey))
                {
                    foreign.Add($"{key}.{nestedKey}");
                }
            }
        }
        return foreign;
    }

    private static JsonObject AsObject(JsonNode? value, string what)
    {
        if (value is not JsonObject obj)
        {
            throw new BridgeException($"{what} harus objek JSON.", 400, InvalidSettings);
        }
        return obj;
    }

    private static JsonNode? StripSecrets(JsonNode? value)
    {
        switch (value)
        {
            case JsonObject obj:
            {
                var result = new JsonObject();
                foreach (var (key, item) in obj)
                {
                    if (key.StartsWith("exit_pin_", StringComparison.Ordinal) || key == "exit_pin")
                    {
                        continue;
                    }
                    result[key] = StripSecrets(item);
                }
                return result;
            }
            case JsonArray array:
            {
                var result = new JsonArray();
                foreach (var item in array)
                {
                    result.Add(StripSecrets(item));
                }
                return result;
            }
            case null:
                return null;
            default:
                return value.DeepClone();
        }
    }

    private JsonObject? StoredGroup(string group) => _store.GetSetting(group) as JsonObject;

    private JsonNode GroupSchema(string group) =>
        SettingsContractSchema.Schema["properties"]?[group] ?? throw new InvalidOperationException($"Schema grup {group} tidak ada.");
}

/// <summary>Respons bridge: status HTTP + body JSON.</summary>
public sealed record BridgeResponse(int Status, JsonNode? Body);
