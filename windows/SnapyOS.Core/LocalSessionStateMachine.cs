using SnapyOS.Contracts;

namespace SnapyOS.Core;

public sealed record LocalSessionSnapshot(
    string SessionId,
    LocalSessionState State,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset LastActivityAt,
    string? LastError = null);

public sealed record LocalSessionTransition(
    string SessionId,
    LocalSessionState From,
    LocalSessionState To,
    DateTimeOffset OccurredAt,
    LocalSessionTransitionReason Reason,
    string? OperationKey = null);

public sealed record AutoFinalizePolicy(bool Enabled);

public sealed class LocalSessionStateMachine
{
    private static readonly Dictionary<LocalSessionState, IReadOnlySet<LocalSessionState>> Allowed =
        new Dictionary<LocalSessionState, IReadOnlySet<LocalSessionState>>
        {
            [LocalSessionState.SessionStart] = new HashSet<LocalSessionState> { LocalSessionState.PaidUnlock, LocalSessionState.TimedOut, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.PaidUnlock] = new HashSet<LocalSessionState> { LocalSessionState.Capture, LocalSessionState.TimedOut, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.Capture] = new HashSet<LocalSessionState> { LocalSessionState.Capture, LocalSessionState.Review, LocalSessionState.Finalize, LocalSessionState.TimedOut, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.Review] = new HashSet<LocalSessionState> { LocalSessionState.Edit, LocalSessionState.Finalize, LocalSessionState.TimedOut, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.Edit] = new HashSet<LocalSessionState> { LocalSessionState.Edit, LocalSessionState.Review, LocalSessionState.Finalize, LocalSessionState.TimedOut, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.Finalize] = new HashSet<LocalSessionState> { LocalSessionState.Print, LocalSessionState.OutputManifest, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.Print] = new HashSet<LocalSessionState> { LocalSessionState.OutputManifest, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.OutputManifest] = new HashSet<LocalSessionState> { LocalSessionState.PendingSync, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.PendingSync] = new HashSet<LocalSessionState> { LocalSessionState.Synced, LocalSessionState.Failed, LocalSessionState.Quarantined },
            [LocalSessionState.Synced] = new HashSet<LocalSessionState>(),
            [LocalSessionState.Failed] = new HashSet<LocalSessionState> { LocalSessionState.Quarantined },
            [LocalSessionState.Quarantined] = new HashSet<LocalSessionState>()
        };

    public static bool CanTransition(LocalSessionState from, LocalSessionState to) =>
        Allowed.TryGetValue(from, out var targets) && targets.Contains(to);

    public LocalSessionTransition Transition(
        LocalSessionSnapshot session,
        LocalSessionState to,
        DateTimeOffset at,
        LocalSessionTransitionReason reason,
        string? operationKey = null)
    {
        if (session.ExpiresAt is not null && at > session.ExpiresAt && to is not LocalSessionState.Finalize and not LocalSessionState.Failed)
            throw new InvalidOperationException("Session has timed out.");
        if (!CanTransition(session.State, to))
            throw new InvalidOperationException($"Invalid local session transition: {session.State} to {to}.");
        return new(session.SessionId, session.State, to, at, reason, operationKey);
    }

    public LocalSessionTransition Timeout(
        LocalSessionSnapshot session,
        DateTimeOffset at,
        AutoFinalizePolicy policy,
        string? operationKey = null)
    {
        if (session.ExpiresAt is null || at < session.ExpiresAt)
            throw new InvalidOperationException("Session has not timed out.");
        var canAutoFinalize = policy.Enabled && session.State is (LocalSessionState.Capture or LocalSessionState.Review or LocalSessionState.Edit);
        var target = canAutoFinalize ? LocalSessionState.Finalize : LocalSessionState.TimedOut;
        var reason = canAutoFinalize ? LocalSessionTransitionReason.AutoFinalizeTimeout : LocalSessionTransitionReason.Timeout;
        if (!CanTransition(session.State, target)) throw new InvalidOperationException("Session cannot be timed out from its current state.");
        return new(session.SessionId, session.State, target, at, reason, operationKey);
    }
}
