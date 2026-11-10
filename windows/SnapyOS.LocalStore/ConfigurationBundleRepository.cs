using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using SnapyOS.Contracts;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed class ConfigurationBundleRepository
{
    private static readonly SemaphoreSlim ApplyLock = new(1, 1);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly LocalStore _store;
    private readonly ConfigurationBundleService _bundles;
    private readonly string _configurationRoot;
    private readonly string _activePath;

    public ConfigurationBundleRepository(LocalStore store, ConfigurationBundleService bundles, string configurationRoot)
    {
        _store = store;
        _bundles = bundles;
        _configurationRoot = Path.GetFullPath(configurationRoot);
        _activePath = Path.Combine(_configurationRoot, "active");
        Directory.CreateDirectory(_configurationRoot);
    }

    public ConfigurationExportResult Export(LocalConfigurationSnapshot snapshot, string outputPath, IReadOnlyDictionary<string, byte[]> assets) =>
        _bundles.Export(snapshot, outputPath, assets);

    public ConfigurationImportPreview Preview(string bundlePath, string deviceId)
    {
        var active = ReadActiveSnapshot();
        return _bundles.Preview(bundlePath, deviceId, active);
    }

    public async Task<ConfigurationBundleApplyResult> ApplyAsync(string bundlePath, string deviceId, CancellationToken cancellationToken = default)
    {
        await ApplyLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var previous = ReadActiveSnapshot();
            var preview = _bundles.Preview(bundlePath, deviceId, previous);
            if (!preview.CanApply) throw new ConfigurationException(string.Join(" ", preview.Issues.Select(issue => issue.Message)));
            var document = ToDocument(preview.Snapshot);
            var json = JsonSerializer.Serialize(document, Json);
            var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
            _store.InsertConfigRevision(document, checksum, json, "candidate");
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                _bundles.Apply(bundlePath, _activePath, deviceId, previous);
                cancellationToken.ThrowIfCancellationRequested();
                using var tx = _store.BeginTransaction();
                _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='backup' WHERE state='active';");
                _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='active' WHERE revision_id=$id;", ("$id", document.RevisionId));
                tx.Commit();
                return new ConfigurationBundleApplyResult(document.RevisionId, null);
            }
            catch
            {
                if (Directory.Exists(_activePath + ".backup"))
                {
                    try { _bundles.Rollback(_activePath); } catch { /* preserve backup for operator recovery */ }
                }
                _store.DeleteConfigRevision(document.RevisionId);
                throw;
            }
        }
        finally { ApplyLock.Release(); }
    }

    public void Rollback(string revisionId)
    {
        var revision = _store.ReadConfigRevision(revisionId) ?? throw new ConfigurationException("Configuration revision not found.");
        _bundles.Rollback(_activePath);
        using var tx = _store.BeginTransaction();
        _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='backup' WHERE state='active';");
        _store.ExecuteInTransaction(tx, "UPDATE config_revisions SET state='active' WHERE revision_id=$id;", ("$id", revisionId));
        tx.Commit();
    }

    private LocalConfigurationSnapshot? ReadActiveSnapshot()
    {
        var document = _store.ReadActiveConfigRevision();
        if (document is null) return null;
        return JsonSerializer.Deserialize<LocalConfigurationSnapshot>(document.Values.ToJsonString(), Json);
    }

    private static ConfigurationDocument ToDocument(LocalConfigurationSnapshot snapshot) => new(
        snapshot.SchemaVersion,
        $"cfg_{Guid.NewGuid():N}",
        DateTimeOffset.UtcNow,
        JsonNode.Parse(JsonSerializer.Serialize(snapshot, Json))!.AsObject());
}
