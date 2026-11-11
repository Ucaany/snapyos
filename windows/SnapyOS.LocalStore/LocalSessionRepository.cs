using SnapyOS.Contracts;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed class LocalSessionRepository(LocalStore store)
{
    private readonly LocalStore _store = store;
    private readonly LocalSessionStateMachine _machine = new();

    public SessionRecord Start(string sessionId, string businessSlug, string photoboxSlug, string packageId, string idempotencyKey, DateTimeOffset createdAt, DateTimeOffset expiresAt) =>
        _store.InsertSession(sessionId, businessSlug, photoboxSlug, packageId, idempotencyKey, createdAt, expiresAt: expiresAt);

    public SessionRecord? Read(string sessionId) => _store.GetSession(sessionId);

    public bool Transition(string sessionId, LocalSessionState next, DateTimeOffset at, LocalSessionTransitionReason reason, string? operationKey = null, string? error = null)
    {
        var current = _store.GetSession(sessionId) ?? throw new InvalidOperationException("Local session was not found.");
        var from = ParseState(current.State);
        var snapshot = new LocalSessionSnapshot(sessionId, from, current.ExpiresAt, current.LastActivityAt ?? current.CreatedAt, current.LastError);
        _machine.Transition(snapshot, next, at, reason, operationKey);
        return _store.TryTransitionSession(sessionId, current.State, next.ToString(), at, reason.ToString(), operationKey, error);
    }

    public IReadOnlyList<LocalSessionTransition> RecoverAfterRestart(DateTimeOffset at, AutoFinalizePolicy policy)
    {
        var recovered = new List<LocalSessionTransition>();
        foreach (var session in _store.ListSessionsDue(at))
        {
            if (session.State.Equals("finalized", StringComparison.OrdinalIgnoreCase) ||
                session.State.Equals("Finalize", StringComparison.OrdinalIgnoreCase) ||
                session.State.Equals("OutputManifest", StringComparison.OrdinalIgnoreCase) ||
                session.State.Equals("PendingSync", StringComparison.OrdinalIgnoreCase) ||
                session.State.Equals("Synced", StringComparison.OrdinalIgnoreCase) ||
                session.State.Equals("TimedOut", StringComparison.OrdinalIgnoreCase) ||
                session.State.Equals("Failed", StringComparison.OrdinalIgnoreCase) ||
                session.State.Equals("Quarantined", StringComparison.OrdinalIgnoreCase)) continue;
            try { recovered.Add(Timeout(session.SessionId, at, policy, $"restart:{session.SessionId}")); }
            catch (InvalidOperationException) { }
        }
        return recovered;
    }

    public LocalSessionTransition Timeout(string sessionId, DateTimeOffset at, AutoFinalizePolicy policy, string? operationKey = null)
    {
        var current = _store.GetSession(sessionId) ?? throw new InvalidOperationException("Local session was not found.");
        var snapshot = new LocalSessionSnapshot(sessionId, ParseState(current.State), current.ExpiresAt, current.LastActivityAt ?? current.CreatedAt, current.LastError);
        var transition = _machine.Timeout(snapshot, at, policy, operationKey);
        if (!_store.TryTransitionSession(sessionId, current.State, transition.To.ToString(), at, transition.Reason.ToString(), operationKey))
            throw new InvalidOperationException("Local session changed during timeout handling.");
        return transition;
    }

    private static LocalSessionState ParseState(string state) => state switch
    {
        "active" => LocalSessionState.SessionStart,
        "finalized" => LocalSessionState.Finalize,
        _ when Enum.TryParse<LocalSessionState>(state, ignoreCase: true, out var parsed) => parsed,
        _ => throw new InvalidOperationException($"Unknown local session state: {state}.")
    };
}
