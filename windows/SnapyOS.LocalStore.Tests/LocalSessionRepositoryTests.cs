using SnapyOS.Contracts;
using Xunit;

namespace SnapyOS.LocalStore.Tests;

public sealed class LocalSessionRepositoryTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-session-{Guid.NewGuid():N}");
    private readonly LocalStore _store;
    private readonly LocalSessionRepository _sessions;

    public LocalSessionRepositoryTests()
    {
        _store = new LocalStore(LocalStoreOptions.ForDirectory(_root));
        _sessions = new LocalSessionRepository(_store);
    }

    [Fact]
    public void Persists_every_transition_and_rejects_stale_writer()
    {
        var now = DateTimeOffset.UtcNow;
        _sessions.Start("local_1", "business", "booth", "package", "session-key", now, now.AddMinutes(5));
        Assert.True(_sessions.Transition("local_1", LocalSessionState.PaidUnlock, now.AddSeconds(1), LocalSessionTransitionReason.Paid));
        Assert.False(_store.TryTransitionSession("local_1", "active", "Capture", now.AddSeconds(2), "stale"));
        Assert.Equal(LocalSessionState.PaidUnlock.ToString(), _store.GetSession("local_1")!.State);
        Assert.Equal(2, _store.ReadSessionTransitions("local_1").Count);
    }

    [Fact]
    public void Restart_preserves_state_and_transition_history()
    {
        var now = DateTimeOffset.UtcNow;
        _sessions.Start("local_1", "business", "booth", "package", "session-key", now, now.AddMinutes(5));
        _sessions.Transition("local_1", LocalSessionState.PaidUnlock, now.AddSeconds(1), LocalSessionTransitionReason.Paid);
        _store.Dispose();
        using var reopened = new LocalStore(LocalStoreOptions.ForDirectory(_root));
        Assert.Equal(LocalSessionState.PaidUnlock.ToString(), reopened.GetSession("local_1")!.State);
        Assert.Equal(2, reopened.ReadSessionTransitions("local_1").Count);
        Assert.Equal(3, reopened.SchemaVersion);
    }

    [Fact]
    public void Timeout_uses_persisted_deadline_and_auto_finalize_policy()
    {
        var created = DateTimeOffset.UtcNow.AddMinutes(-6);
        _sessions.Start("local_1", "business", "booth", "package", "session-key", created, created.AddMinutes(5));
        _sessions.Transition("local_1", LocalSessionState.PaidUnlock, created.AddSeconds(1), LocalSessionTransitionReason.Paid);
        _sessions.Transition("local_1", LocalSessionState.Capture, created.AddSeconds(2), LocalSessionTransitionReason.Captured);
        var transition = _sessions.Timeout("local_1", DateTimeOffset.UtcNow, new(true));
        Assert.Equal(LocalSessionState.Finalize, transition.To);
        Assert.Equal(LocalSessionState.Finalize.ToString(), _store.GetSession("local_1")!.State);
    }

    public void Dispose()
    {
        _store.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }
}
