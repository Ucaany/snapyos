using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed class ConfigurationRepository : IConfigurationRepository
{
    private readonly LocalStore _store;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);
    private ConfigurationDocument? _draft;
    private ConfigurationDocument? _active;
    private readonly List<ConfigurationDocument> _backups = [];

    public ConfigurationRepository(LocalStore store)
    {
        _store = store;
        LoadActive();
    }

    public ConfigurationDocument? Draft => _draft;
    public ConfigurationDocument? Active => _active;
    public IReadOnlyList<ConfigurationDocument> Backups => _backups;

    public ConfigurationDocument SaveDraft(JsonObject values, ConfigurationValidationOptions? options = null)
    {
        var normalized = ConfigurationSchema.ValidateAndNormalize(values, options ?? new(), out var unknown);
        _draft = NewDocument(normalized, unknown);
        return _draft;
    }

    public async Task<ConfigurationApplyResult> ApplyAsync(IConfigurationHealthCheck healthCheck, CancellationToken cancellationToken = default)
    {
        if (_draft is null) throw new ConfigurationException("No draft configuration exists.");
        var candidate = _draft;
        var previous = _active;
        var backupId = previous?.RevisionId;
        PersistConfiguration(candidate, previous, active: false);
        try
        {
            var healthy = await healthCheck.CheckAsync(candidate, cancellationToken).ConfigureAwait(false);
            if (!healthy) throw new ConfigurationException("Configuration health check failed.");
            using var tx = _store.BeginTransaction();
            _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='backup' WHERE state='active';");
            _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='active' WHERE revision_id=$id;", ("$id", candidate.RevisionId));
            tx.Commit();
            _active = candidate;
            _draft = null;
            if (previous is not null) _backups.Insert(0, previous);
            return new ConfigurationApplyResult(candidate.RevisionId, backupId, candidate.SchemaVersion);
        }
        catch
        {
            _store.DeleteConfigRevision(candidate.RevisionId);
            throw;
        }
    }

    public void Rollback(string revisionId)
    {
        var revision = _store.ReadConfigRevision(revisionId) ?? throw new ConfigurationException("Configuration revision not found.");
        using var tx = _store.BeginTransaction();
        _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='backup' WHERE state='active';");
        _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='active' WHERE revision_id=$id;", ("$id", revision.RevisionId));
        tx.Commit();
        _active = revision;
    }

    public ConfigurationDocument Import(string json, ConfigurationValidationOptions? options = null)
    {
        var node = JsonNode.Parse(json)?.AsObject() ?? throw new ConfigurationException("Configuration JSON must be an object.");
        var version = node["schemaVersion"]?.GetValue<int>() ?? throw new ConfigurationException("schemaVersion is required.");
        if (version > ConfigurationSchema.CurrentVersion) throw new ConfigurationException("Configuration schema is newer than this application.");
        var values = node["values"]?.AsObject() ?? throw new ConfigurationException("values is required.");
        var migrated = ConfigurationSchema.Migrate(values, version);
        return SaveDraft(migrated, options);
    }

    public string ExportDraft()
    {
        if (_draft is null) throw new ConfigurationException("No draft configuration exists.");
        return JsonSerializer.Serialize(_draft, _json);
    }

    private void LoadActive()
    {
        _active = _store.ReadActiveConfigRevision();
        _backups.AddRange(_store.ReadBackupConfigRevisions());
    }

    private ConfigurationDocument NewDocument(JsonObject values, JsonObject? unknown) => new(
        ConfigurationSchema.CurrentVersion,
        $"cfg_{Guid.NewGuid():N}",
        DateTimeOffset.UtcNow,
        values,
        unknown is { Count: > 0 } ? unknown : null);

    private void PersistConfiguration(ConfigurationDocument document, ConfigurationDocument? previous, bool active)
    {
        var json = JsonSerializer.Serialize(document, _json);
        var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
        _store.InsertConfigRevision(document, checksum, json, active ? "active" : "candidate");
    }
}
