using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using SnapyOS.Contracts;

namespace SnapyOS.Core;

public interface ITemplateCatalogStore
{
    TemplateCatalogDocument? ReadActive();
    TemplateCatalogDocument? ReadLastKnownGood();
    void Stage(TemplateCatalogDocument catalog);
    void StageAsset(string catalogVersion, AssetManifest asset, string relativePath);
    void MarkAssetVerified(string catalogVersion, string assetId);
    void Quarantine(string catalogVersion, string assetId, string reason);
    void Activate(string catalogVersion);
}

public sealed record TemplateCatalogSyncResult(
    TemplateCatalogDocument Catalog,
    bool UsedOfflineCache,
    IReadOnlyList<string> QuarantinedAssets);

public sealed class TemplateCatalogSync
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };
    private readonly HttpClient _http;
    private readonly ITemplateCatalogStore _store;
    private readonly string _cacheRoot;

    public TemplateCatalogSync(HttpClient http, ITemplateCatalogStore store, string cacheRoot)
    {
        _http = http;
        _store = store;
        _cacheRoot = Path.GetFullPath(cacheRoot);
        Directory.CreateDirectory(_cacheRoot);
    }

    public async Task<TemplateCatalogSyncResult> SyncAsync(Uri endpoint, string? packageId = null, CancellationToken cancellationToken = default)
    {
        var quarantined = new List<string>();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, AddPackage(endpoint, packageId));
            var active = _store.ReadActive();
            if (active is not null) request.Headers.IfNoneMatch.Add(new EntityTagHeaderValue($"\"{active.CatalogVersion}\""));
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            if (response.StatusCode == HttpStatusCode.NotModified && active is not null)
                return new(active, false, []);
            response.EnsureSuccessStatusCode();
            var envelope = await response.Content.ReadFromJsonAsync<CatalogEnvelope>(Json, cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidDataException("Template catalog response is empty.");
            var catalog = envelope.Data ?? throw new InvalidDataException("Template catalog data is empty.");
            ValidateCatalog(catalog, packageId);
            _store.Stage(catalog);
            foreach (var template in catalog.Templates)
            {
                if (catalog.RevokedTemplateIds.Contains(template.TemplateId, StringComparer.Ordinal)) continue;
                foreach (var asset in template.Assets)
                {
                    _store.StageAsset(catalog.CatalogVersion, asset, Path.Combine("versions", catalog.CatalogVersion, "assets", Path.GetFileName(asset.AssetId) + "." + asset.Sha256.ToLowerInvariant()));
                    try
                    {
                        await DownloadAssetAsync(catalog.CatalogVersion, asset, cancellationToken).ConfigureAwait(false);
                        _store.MarkAssetVerified(catalog.CatalogVersion, asset.AssetId);
                    }
                    catch (Exception ex) when (ex is HttpRequestException or IOException or InvalidDataException)
                    {
                        _store.Quarantine(catalog.CatalogVersion, asset.AssetId, ex.Message);
                        quarantined.Add(asset.AssetId);
                    }
                }
            }
            if (quarantined.Count > 0) throw new InvalidDataException("One or more template assets failed validation.");
            _store.Activate(catalog.CatalogVersion);
            return new(catalog, false, quarantined);
        }
        catch (Exception) when (cancellationToken.IsCancellationRequested is false)
        {
            var fallback = _store.ReadLastKnownGood() ?? _store.ReadActive();
            if (fallback is null) throw;
            return new(fallback, true, quarantined);
        }
    }

    private async Task DownloadAssetAsync(string version, AssetManifest asset, CancellationToken cancellationToken)
    {
        var safeId = Path.GetFileName(asset.AssetId);
        if (!string.Equals(safeId, asset.AssetId, StringComparison.Ordinal) || safeId is "." or "..")
            throw new InvalidDataException("Asset id is unsafe.");
        var directory = Path.Combine(_cacheRoot, "versions", version, "assets");
        Directory.CreateDirectory(directory);
        var partPath = Path.Combine(directory, safeId + ".part");
        var finalPath = Path.Combine(directory, safeId + "." + asset.Sha256.ToLowerInvariant());
        if (File.Exists(finalPath) && await MatchesAsync(finalPath, asset, cancellationToken).ConfigureAwait(false))
        {
            _store.StageAsset(version, asset, Path.GetRelativePath(_cacheRoot, finalPath));
            return;
        }

        var offset = File.Exists(partPath) ? new FileInfo(partPath).Length : 0;
        var requestOffset = offset;
        using var request = new HttpRequestMessage(HttpMethod.Get, asset.SignedUrl ?? throw new InvalidDataException("Asset URL is missing."));
        var uri = request.RequestUri;
        if (uri is null || !uri.IsAbsoluteUri || uri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidDataException("Asset URL must use HTTPS.");
        if (requestOffset > 0) request.Headers.Range = new RangeHeaderValue(requestOffset, null);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        var append = requestOffset > 0 && response.StatusCode == HttpStatusCode.PartialContent;
        if (requestOffset > 0 && !append)
        {
            offset = 0;
            File.Delete(partPath);
        }
        response.EnsureSuccessStatusCode();
        var type = response.Content.Headers.ContentType?.MediaType;
        if (!string.Equals(type, asset.ContentType, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Asset content type does not match manifest.");
        await using (var output = new FileStream(partPath, append ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.SequentialScan))
        await using (var input = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false))
        {
            await input.CopyToAsync(output, cancellationToken).ConfigureAwait(false);
            output.Flush(true);
        }
        if (!await MatchesAsync(partPath, asset, cancellationToken).ConfigureAwait(false))
            throw new InvalidDataException("Asset checksum or size does not match manifest.");
        File.Move(partPath, finalPath, true);
        _store.StageAsset(version, asset, Path.GetRelativePath(_cacheRoot, finalPath));
    }

    private static async Task<bool> MatchesAsync(string path, AssetManifest asset, CancellationToken cancellationToken)
    {
        var info = new FileInfo(path);
        if (info.Length != asset.SizeBytes) return false;
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.SequentialScan);
        var hash = await SHA256.HashDataAsync(stream, cancellationToken).ConfigureAwait(false);
        return Convert.ToHexString(hash).Equals(asset.Sha256, StringComparison.OrdinalIgnoreCase);
    }

    private static void ValidateCatalog(TemplateCatalogDocument catalog, string? packageId)
    {
        ContractValidator.ThrowIfInvalid(catalog);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var template in catalog.Templates)
        {
            if (!ids.Add(template.TemplateId))
                throw new InvalidDataException("Catalog contains duplicate template.");
            if (catalog.RevokedTemplateIds.Contains(template.TemplateId, StringComparer.Ordinal))
                continue;
            if (!template.IsActive || template.State != TemplateCatalogState.Active)
                throw new InvalidDataException("Catalog contains an inactive template.");
            if (packageId is not null && template.EligiblePackageIds.Count > 0 && !template.EligiblePackageIds.Contains(packageId, StringComparer.Ordinal))
                throw new InvalidDataException("Catalog contains an ineligible template.");
            var assets = new HashSet<string>(StringComparer.Ordinal);
            foreach (var asset in template.Assets)
                if (!assets.Add(asset.AssetId)) throw new InvalidDataException("Catalog contains duplicate asset.");
        }
    }

    private static Uri AddPackage(Uri endpoint, string? packageId)
    {
        if (string.IsNullOrWhiteSpace(packageId)) return endpoint;
        var builder = new UriBuilder(endpoint);
        var separator = string.IsNullOrEmpty(builder.Query) ? "?" : "&";
        builder.Query = builder.Query.TrimStart('?') + separator.TrimStart('?') + $"package={Uri.EscapeDataString(packageId)}";
        return builder.Uri;
    }

    private sealed record CatalogEnvelope(TemplateCatalogDocument? Data);
}
