using System.Text.Json.Nodes;
using SnapyOS.Contracts;

namespace SnapyOS.Core;

public enum UnknownFieldPolicy { Reject, Preserve }
public enum PinKind { Admin, KioskExit, OfflineEmergency }

public sealed record ConfigurationDocument(
    int SchemaVersion,
    string RevisionId,
    DateTimeOffset CreatedAt,
    JsonObject Values,
    JsonObject? UnknownFields = null);

public sealed record ConfigurationValidationOptions(UnknownFieldPolicy UnknownFields = UnknownFieldPolicy.Reject);

public sealed record ConfigurationApplyResult(
    string ActiveRevisionId,
    string? BackupRevisionId,
    int SchemaVersion);

public sealed class ConfigurationException(string message) : InvalidOperationException(message);

public interface IConfigurationHealthCheck
{
    Task<bool> CheckAsync(ConfigurationDocument configuration, CancellationToken cancellationToken = default);
}

public interface IConfigurationRepository
{
    ConfigurationDocument? Draft { get; }
    ConfigurationDocument? Active { get; }
    IReadOnlyList<ConfigurationDocument> Backups { get; }
    ConfigurationDocument SaveDraft(JsonObject values, ConfigurationValidationOptions? options = null);
    Task<ConfigurationApplyResult> ApplyAsync(IConfigurationHealthCheck healthCheck, CancellationToken cancellationToken = default);
    void Rollback(string revisionId);
    ConfigurationDocument Import(string json, ConfigurationValidationOptions? options = null);
    string ExportDraft();
}

public static class ConfigurationSchema
{
    public const int CurrentVersion = 2;

    private static readonly HashSet<string> KnownFields = new(StringComparer.Ordinal)
    {
        "camera", "printer", "session", "appearance", "retention"
    };

    public static JsonObject Migrate(JsonObject values, int sourceVersion)
    {
        if (sourceVersion < 1 || sourceVersion > CurrentVersion)
            throw new ConfigurationException($"Unsupported configuration schema version: {sourceVersion}.");
        var migrated = (JsonObject)values.DeepClone();
        if (sourceVersion == 1)
        {
            if (migrated["session_timeout_seconds"] is JsonValue timeout)
            {
                migrated["session"] = new JsonObject { ["timer_seconds"] = timeout.GetValue<int>() };
                migrated.Remove("session_timeout_seconds");
            }
        }
        return migrated;
    }

    public static JsonObject ValidateAndNormalize(
        JsonObject values,
        ConfigurationValidationOptions options,
        out JsonObject? unknown)
    {
        if (values.Count == 0) throw new ConfigurationException("Configuration cannot be empty.");
        RejectNestedSecrets(values);
        var normalized = (JsonObject)values.DeepClone();
        unknown = new JsonObject();
        foreach (var property in values.ToList())
        {
            if (KnownFields.Contains(property.Key)) continue;
            if (IsSecretField(property.Key)) throw new ConfigurationException($"Secret field is not allowed: {property.Key}.");
            if (options.UnknownFields == UnknownFieldPolicy.Reject)
                throw new ConfigurationException($"Unknown configuration field: {property.Key}.");
            unknown[property.Key] = property.Value?.DeepClone();
            normalized.Remove(property.Key);
        }

        ValidateObject(normalized, "camera", "provider");
        ValidateObject(normalized, "printer", "kind");
        ValidateObject(normalized, "session", "timer_seconds");
        return normalized;
    }

    private static void RejectNestedSecrets(JsonNode node)
    {
        if (node is JsonObject obj)
        {
            foreach (var property in obj)
            {
                if (IsSecretField(property.Key)) throw new ConfigurationException($"Secret field is not allowed: {property.Key}.");
                if (property.Value is not null) RejectNestedSecrets(property.Value);
            }
        }
        else if (node is JsonArray array)
        {
            foreach (var item in array) if (item is not null) RejectNestedSecrets(item);
        }
    }

    private static void ValidateObject(JsonObject root, string name, string required)
    {
        if (root[name] is not JsonObject value) return;
        if (value[required] is null) throw new ConfigurationException($"Configuration section '{name}' requires '{required}'.");
    }

    private static bool IsSecretField(string name) =>
        name.Contains("secret", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("token", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("credential", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("apikey", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("api_key", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("pin", StringComparison.OrdinalIgnoreCase);
}
