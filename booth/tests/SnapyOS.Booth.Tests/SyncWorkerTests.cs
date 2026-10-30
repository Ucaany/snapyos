using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Sessions;
using SnapyOS.Booth.Core.Sync;
using Xunit;

namespace SnapyOS.Booth.Tests;

/// <summary>Handler HTTP palsu: merekam permintaan, membalas jawaban terprogram.</summary>
internal sealed class FakeCloudHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

    public List<HttpRequestMessage> Requests { get; } = [];

    public FakeCloudHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
    {
        _responder = responder;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        return Task.FromResult(_responder(request));
    }

    public static HttpResponseMessage Json(HttpStatusCode status, string body) => new(status)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };
}

public sealed class SyncWorkerTests : IDisposable
{
    private readonly TestFactory.TempDir _dir = new();

    public void Dispose() => _dir.Dispose();

    private (Store Store, RuntimeConfig Config, SyncWorker Worker, SessionsService Sessions, FakeCloudHandler Cloud) Setup(
        Func<HttpRequestMessage, HttpResponseMessage> responder)
    {
        var config = TestFactory.Config(_dir.Path, cloudUrl: "https://cloud.test", deviceToken: "device-token-xyz");
        var store = Store.Open(_dir.Path);
        store.SetMeta("business_slug", "snapy-demo");
        store.SetMeta("photobox_slug", "booth-01");
        var cloud = new FakeCloudHandler(responder);
        var worker = new SyncWorker(store, config, new HttpClient(cloud), random: () => 0.5, log: _ => { });
        var sessions = new SessionsService(
            store,
            Path.Combine(_dir.Path, "media"),
            _ => Task.FromResult(TestFactory.TinyJpeg));
        return (store, config, worker, sessions, cloud);
    }

    private async Task<string> FinalizeOneAsync(SessionsService sessions)
    {
        var id = sessions.CreateSession(TestFactory.Json(
            """{"package_id":"pkg-1","package_snapshot":{"id":"pkg-1"},"timer_seconds":60}""")).Body!["id"]!.GetValue<string>();
        await sessions.CaptureSlotAsync(id, "k1", null, default);
        sessions.FinalizeSession(id, [new MultipartPart("photos", "photo.jpg", TestFactory.TinyJpeg)]);
        return id;
    }

    [Fact]
    public void backoff_is_capped_at_five_minutes()
    {
        var (store, config, worker, _, _) = Setup(_ => FakeCloudHandler.Json(HttpStatusCode.OK, "{}"));
        using (store)
        {
            // random 0.5 → jitter 1.0, jadi nilai = base.
            Assert.Equal(SyncWorker.BaseBackoffMs, worker.BackoffDelay(0));
            Assert.Equal(2_000, worker.BackoffDelay(1));
            Assert.Equal(4_000, worker.BackoffDelay(2));
            Assert.Equal(300_000, worker.BackoffDelay(30)); // cap 5 menit
        }
        _ = config;
    }

    [Fact]
    public async Task successful_sync_creates_cloud_session_finalizes_and_marks_synced()
    {
        var (store, _, worker, sessions, cloud) = Setup(request =>
            request.Method == HttpMethod.Post && request.RequestUri!.AbsolutePath.EndsWith("/sessions")
                ? FakeCloudHandler.Json(HttpStatusCode.OK, """{"data":{"session_id":"cloud-1"}}""")
                : FakeCloudHandler.Json(HttpStatusCode.OK, """{"data":{}}"""));

        using (store)
        {
            var id = await FinalizeOneAsync(sessions);
            var report = await worker.RunOnceAsync(default);

            Assert.Equal(1, report.Synced);
            Assert.Equal(2, cloud.Requests.Count); // create + finalize
            Assert.Contains(cloud.Requests, r => r.Headers.Contains("Idempotency-Key"));
            // cloud_id tersimpan segera
            var session = sessions.ReadSession(id).Body!.AsObject();
            Assert.Equal("cloud-1", session["cloud_id"]!.GetValue<string>());
            Assert.NotNull(session["synced_at"]!.GetValue<string>());
        }
    }

    [Fact]
    public async Task expired_answer_quarantines_media_and_removes_local_row()
    {
        var (store, _, worker, sessions, _) = Setup(_ =>
            FakeCloudHandler.Json(HttpStatusCode.Gone, """{"error":{"code":"SESSION_EXPIRED"}}"""));

        using (store)
        {
            var id = await FinalizeOneAsync(sessions);
            var report = await worker.RunOnceAsync(default);

            Assert.Equal(1, report.Quarantined);
            var quarantine = Path.Combine(_dir.Path, "quarantine", id);
            Assert.True(Directory.Exists(quarantine));
            Assert.True(File.Exists(Path.Combine(quarantine, "finalize.json")));
            Assert.True(File.Exists(Path.Combine(quarantine, "final-0.jpg")));
            // Baris lokal hilang setelah dikarantina.
            Assert.Throws<BridgeException>(() => sessions.ReadSession(id));
        }
    }

    [Fact]
    public async Task server_error_schedules_retry_without_losing_session()
    {
        var (store, _, worker, sessions, _) = Setup(_ =>
            FakeCloudHandler.Json(HttpStatusCode.InternalServerError, """{"message":"boom"}"""));

        using (store)
        {
            var id = await FinalizeOneAsync(sessions);
            var report = await worker.RunOnceAsync(default);

            Assert.Equal(1, report.Retrying);
            var session = sessions.ReadSession(id).Body!.AsObject();
            Assert.Null(session["cloud_id"]!.GetValue<string?>());
            // Tetap ada + tidak terkunci permanen (next_attempt_at di masa depan).
            Assert.Null(session["synced_at"]!.GetValue<string?>());
        }
    }

    [Fact]
    public async Task settings_push_excludes_appearance_settings()
    {
        JsonObject? pushed = null;
        var (store, _, worker, _, _) = Setup(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/devices/settings"))
            {
                pushed = JsonNode.Parse(request.Content!.ReadAsStringAsync().Result)!.AsObject();
            }
            return FakeCloudHandler.Json(HttpStatusCode.OK, """{"data":{}}""");
        });

        using (store)
        {
            var service = new SettingsService(store, TestFactory.Config(_dir.Path, "https://cloud.test", "device-token-xyz"));
            service.Write(TestFactory.Json("""{"appearance_settings":{"bg_color":"#112233"}}"""));

            var report = await worker.RunOnceAsync(default);

            Assert.Equal("pushed", report.Settings);
            Assert.NotNull(pushed);
            Assert.False(pushed!["settings"]!.AsObject().ContainsKey("appearance_settings"));
            Assert.Equal(VersionInfo.Version, pushed!["app_version"]!.GetValue<string>());
        }
    }

    [Fact]
    public void can_sync_requires_cloud_url_and_token()
    {
        var (store, _, worker, _, _) = Setup(_ => FakeCloudHandler.Json(HttpStatusCode.OK, "{}"));
        using (store)
        {
            Assert.True(worker.CanSync);
        }

        using var dir2 = new TestFactory.TempDir();
        using var store2 = Store.Open(dir2.Path);
        var offline = new SyncWorker(store2, RuntimeConfig.Load(TestFactory.Env(dir2.Path)), log: _ => { });
        Assert.False(offline.CanSync);
    }
}
