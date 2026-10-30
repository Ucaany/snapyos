using System.Text.Json.Nodes;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Sessions;
using Xunit;

namespace SnapyOS.Booth.Tests;

public sealed class SessionsServiceTests : IDisposable
{
    private readonly TestFactory.TempDir _dir = new();
    private int _captures;

    public void Dispose() => _dir.Dispose();

    private (Store Store, SessionsService Service) Setup()
    {
        var store = Store.Open(_dir.Path);
        store.SetMeta("business_slug", "snapy-demo");
        store.SetMeta("photobox_slug", "booth-01");
        var service = new SessionsService(
            store,
            Path.Combine(_dir.Path, "media"),
            _ =>
            {
                Interlocked.Increment(ref _captures);
                return Task.FromResult(TestFactory.TinyJpeg);
            });
        return (store, service);
    }

    private static JsonObject NewSessionPayload() => TestFactory.Json(
        """{"package_id":"pkg-1","package_snapshot":{"id":"pkg-1","photo_count":2},"timer_seconds":120}""");

    [Fact]
    public void create_session_returns_local_id_and_expiry()
    {
        var (store, service) = Setup();
        using (store)
        {
            var response = service.CreateSession(NewSessionPayload());
            Assert.Equal(201, response.Status);
            var body = response.Body!.AsObject();
            var id = body["id"]!.GetValue<string>();
            Assert.StartsWith(SessionsService.LocalSessionPrefix, id);
            Assert.Equal("active", body["state"]!.GetValue<string>());
            Assert.False(string.IsNullOrEmpty(body["expires_at"]!.GetValue<string>()));
        }
    }

    [Fact]
    public async Task capture_is_idempotent_for_same_key()
    {
        var (store, service) = Setup();
        using (store)
        {
            var id = service.CreateSession(NewSessionPayload()).Body!["id"]!.GetValue<string>();
            var first = await service.CaptureSlotAsync(id, "key-1", TestFactory.Json("""{"slot_index":0}"""), default);
            var second = await service.CaptureSlotAsync(id, "key-1", TestFactory.Json("""{"slot_index":0}"""), default);

            Assert.Equal(201, first.Status);
            Assert.Equal(200, second.Status);
            Assert.True(second.Body!["replay"]!.GetValue<bool>());
            Assert.Equal(1, _captures);
            Assert.True(File.Exists(Path.Combine(_dir.Path, "media", id, "0.jpg")));
        }
    }

    [Fact]
    public async Task capture_without_idempotency_key_is_rejected()
    {
        var (store, service) = Setup();
        using (store)
        {
            var id = service.CreateSession(NewSessionPayload()).Body!["id"]!.GetValue<string>();
            var error = await Assert.ThrowsAsync<BridgeException>(() =>
                service.CaptureSlotAsync(id, null, null, default));
            Assert.Equal(400, error.StatusCode);
        }
    }

    [Fact]
    public async Task finalize_moves_session_to_finalized_and_writes_payload()
    {
        var (store, service) = Setup();
        using (store)
        {
            var id = service.CreateSession(NewSessionPayload()).Body!["id"]!.GetValue<string>();
            await service.CaptureSlotAsync(id, "key-1", null, default);

            var parts = new List<MultipartPart>
            {
                new("retake_count", null, System.Text.Encoding.UTF8.GetBytes("1")),
                new("template_id", null, System.Text.Encoding.UTF8.GetBytes("tmpl-9")),
                new("photos", "photo.jpg", TestFactory.TinyJpeg),
            };
            var response = service.FinalizeSession(id, parts);

            Assert.Equal(200, response.Status);
            Assert.True(File.Exists(Path.Combine(_dir.Path, "media", id, "finalize.json")));
            var row = service.ReadSession(id).Body!.AsObject();
            Assert.Equal("finalized", row["state"]!.GetValue<string>());
            Assert.Equal(1, row["retake_count"]!.GetValue<int>());
        }
    }

    [Fact]
    public async Task finalize_replay_is_idempotent()
    {
        var (store, service) = Setup();
        using (store)
        {
            var id = service.CreateSession(NewSessionPayload()).Body!["id"]!.GetValue<string>();
            var parts = new List<MultipartPart> { new("photos", "photo.jpg", TestFactory.TinyJpeg) };
            var first = service.FinalizeSession(id, parts);
            var second = service.FinalizeSession(id, parts);
            Assert.Equal(200, first.Status);
            Assert.True(second.Body!["replay"]!.GetValue<bool>());
            await Task.CompletedTask;
        }
    }

    [Fact]
    public void abort_marks_session_aborted()
    {
        var (store, service) = Setup();
        using (store)
        {
            var id = service.CreateSession(NewSessionPayload()).Body!["id"]!.GetValue<string>();
            var response = service.AbortSession(id);
            Assert.Equal(200, response.Status);
            var replay = service.AbortSession(id);
            Assert.True(replay.Body!["replay"]!.GetValue<bool>());
        }
    }

    [Fact]
    public void unknown_session_returns_404()
    {
        var (store, service) = Setup();
        using (store)
        {
            var error = Assert.Throws<BridgeException>(() => service.ReadSession("local_missing"));
            Assert.Equal(404, error.StatusCode);
        }
    }
}
