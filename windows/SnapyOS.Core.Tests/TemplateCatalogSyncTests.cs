using System.Security.Cryptography;
using SnapyOS.Contracts;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class TemplateCatalogSyncTests
{
    [Fact]
    public async Task Invalid_asset_falls_back_without_uploading_session_media()
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes("not-a-frame");
        var catalog = new TemplateCatalogDocument
        {
            CatalogVersion = "v2",
            Templates =
            [
                new TemplateCatalogItem
                {
                    TemplateId = "template-1",
                    Name = "Frame",
                    Category = "custom",
                    IsActive = true,
                    Assets =
                    [
                        new AssetManifest
                        {
                            AssetId = "frame",
                            ObjectKey = "business-assets/templates/frame.png",
                            ContentType = "image/png",
                            SizeBytes = bytes.Length,
                            Sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
                            SignedUrl = "https://cdn.example/frame.png"
                        }
                    ]
                }
            ]
        };
        var store = new FakeStore(catalog with { CatalogVersion = "v1" });
        using var http = new HttpClient(new Handler(catalog, bytes));
        var cacheRoot = Path.Combine(Path.GetTempPath(), $"snapyos-catalog-{Guid.NewGuid():N}");
        try
        {
            var result = await new TemplateCatalogSync(http, store, cacheRoot).SyncAsync(new Uri("https://api.example/templates/catalog"), "package-1");
            Assert.True(result.UsedOfflineCache);
            Assert.Equal("v1", result.Catalog.CatalogVersion);
            Assert.Single(result.QuarantinedAssets);
            Assert.DoesNotContain("generated-photos", store.UploadedPaths);
        }
        finally { Directory.Delete(cacheRoot, true); }
    }

    private sealed class FakeStore(TemplateCatalogDocument fallback) : ITemplateCatalogStore
    {
        public List<string> UploadedPaths { get; } = [];
        public TemplateCatalogDocument? ReadActive() => fallback;
        public TemplateCatalogDocument? ReadLastKnownGood() => fallback;
        public void Stage(TemplateCatalogDocument catalog) { }
        public void StageAsset(string catalogVersion, AssetManifest asset, string relativePath) => UploadedPaths.Add(relativePath);
        public void MarkAssetVerified(string catalogVersion, string assetId) { }
        public void Quarantine(string catalogVersion, string assetId, string reason) => UploadedPaths.Add(assetId);
        public void Activate(string catalogVersion) { }
    }

    private sealed class Handler(TemplateCatalogDocument catalog, byte[] bytes) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri?.AbsolutePath.EndsWith("catalog", StringComparison.Ordinal) == true)
                return Task.FromResult(Json(catalog));
            var response = new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(bytes)
            };
            response.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
            return Task.FromResult(response);
        }

        private static HttpResponseMessage Json(TemplateCatalogDocument value) => new()
        {
            StatusCode = System.Net.HttpStatusCode.OK,
            Content = new StringContent($"{{\"data\":{ContractJson.Serialize(value)}}}", System.Text.Encoding.UTF8, "application/json")
        };
    }
}
