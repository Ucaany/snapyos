using System.Text.Json;
using SnapyOS.Contracts;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed record TemplateCacheAsset(
    string CatalogVersion,
    string AssetId,
    string RelativePath,
    string ObjectKey,
    string ExpectedSha256,
    long ExpectedSize,
    string ContentType,
    long DownloadedBytes,
    string? Etag,
    string State,
    string? QuarantineReason);

public sealed record TemplateCacheSnapshot(string CatalogVersion, string PayloadJson, string State, DateTimeOffset CreatedAt);

public sealed class TemplateCacheRepository : ITemplateCatalogStore
{
    private readonly LocalStore _store;

    public TemplateCacheRepository(LocalStore store) => _store = store;

    public string? ActiveVersion => ReadPointer("active");
    public string? LastKnownGoodVersion => ReadPointer("last_known_good");

    public void Stage(TemplateCatalogDocument catalog)
    {
        ContractValidator.ThrowIfInvalid(catalog);
        var json = ContractJson.Serialize(catalog);
        _store.Execute("INSERT OR REPLACE INTO template_catalog_versions(catalog_version, payload_json, state, created_at) VALUES($version, $payload, 'staged', $at);", null,
            ("$version", catalog.CatalogVersion), ("$payload", json), ("$at", DateTimeOffset.UtcNow.ToString("O")));
    }

    public void StageAsset(string catalogVersion, AssetManifest asset, string relativePath)
    {
        if (Path.IsPathRooted(relativePath) || relativePath.Contains("..", StringComparison.Ordinal) || relativePath.Contains('\\'))
            throw new InvalidOperationException("Template cache path escapes cache root.");
        _store.Execute("INSERT OR REPLACE INTO template_catalog_assets(catalog_version, asset_id, relative_path, object_key, expected_sha256, expected_size, content_type, downloaded_bytes, etag, state) VALUES($version, $id, $path, $key, $sha, $size, $type, $bytes, $etag, 'staged');", null,
            ("$version", catalogVersion), ("$id", asset.AssetId), ("$path", relativePath), ("$key", asset.ObjectKey), ("$sha", asset.Sha256), ("$size", asset.SizeBytes), ("$type", asset.ContentType), ("$bytes", 0), ("$etag", null));
    }

    public void UpdateProgress(string catalogVersion, string assetId, long downloadedBytes, string? etag) =>
        _store.Execute("UPDATE template_catalog_assets SET downloaded_bytes=$bytes, etag=$etag WHERE catalog_version=$version AND asset_id=$id;", null,
            ("$bytes", downloadedBytes), ("$etag", etag), ("$version", catalogVersion), ("$id", assetId));

    public void Quarantine(string catalogVersion, string assetId, string reason) =>
        _store.Execute("UPDATE template_catalog_assets SET state='quarantined', quarantine_reason=$reason WHERE catalog_version=$version AND asset_id=$id;", null,
            ("$reason", reason), ("$version", catalogVersion), ("$id", assetId));

    public void Activate(string catalogVersion)
    {
        using var tx = _store.BeginTransaction();
        var previous = ReadPointer("active", tx);
        _store.ExecuteInTransaction(tx, "UPDATE template_catalog_versions SET state='backup' WHERE state='active';");
        var activated = _store.ExecuteInTransaction(tx, "UPDATE template_catalog_versions SET state='active' WHERE catalog_version=$version AND NOT EXISTS (SELECT 1 FROM template_catalog_assets WHERE catalog_version=$version AND state <> 'verified');", ("$version", catalogVersion));
        if (activated != 1)
        {
            tx.Rollback();
            throw new InvalidOperationException("Template catalog is incomplete and cannot be activated.");
        }
        _store.ExecuteInTransaction(tx, "INSERT OR REPLACE INTO template_catalog_state(key, catalog_version, updated_at) VALUES('active', $version, $at);", ("$version", catalogVersion), ("$at", DateTimeOffset.UtcNow.ToString("O")));
        if (previous is not null)
            _store.ExecuteInTransaction(tx, "INSERT OR REPLACE INTO template_catalog_state(key, catalog_version, updated_at) VALUES('last_known_good', $version, $at);", ("$version", previous), ("$at", DateTimeOffset.UtcNow.ToString("O")));
        tx.Commit();
    }

    public void MarkAssetVerified(string catalogVersion, string assetId) =>
        _store.Execute("UPDATE template_catalog_assets SET state='verified' WHERE catalog_version=$version AND asset_id=$id;", null,
            ("$version", catalogVersion), ("$id", assetId));

    public TemplateCatalogDocument? ReadActive() => ReadDocument(ActiveVersion);
    public TemplateCatalogDocument? ReadLastKnownGood() => ReadDocument(LastKnownGoodVersion);

    private TemplateCatalogDocument? ReadDocument(string? version)
    {
        var snapshot = ReadSnapshot(version);
        return snapshot is null ? null : JsonSerializer.Deserialize<TemplateCatalogDocument>(snapshot.PayloadJson, ContractJson.Options);
    }

    private TemplateCacheSnapshot? ReadSnapshot(string? version)
    {
        if (version is null) return null;
        using var command = _store.CreatePublicCommand("SELECT catalog_version, payload_json, state, created_at FROM template_catalog_versions WHERE catalog_version=$version;", ("$version", version));
        using var reader = command.ExecuteReader();
        return reader.Read() ? new(reader.GetString(0), reader.GetString(1), reader.GetString(2), DateTimeOffset.Parse(reader.GetString(3))) : null;
    }

    private string? ReadPointer(string key, Microsoft.Data.Sqlite.SqliteTransaction? tx = null)
    {
        using var command = _store.CreateCommandForCatalog("SELECT catalog_version FROM template_catalog_state WHERE key=$key;", tx, ("$key", key));
        return command.ExecuteScalar() as string;
    }
}
