using SnapyOS.Contracts;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class LocalSessionStateMachineTests
{
    private static LocalSessionSnapshot Session(LocalSessionState state, DateTimeOffset? expiresAt = null) =>
        new("session", state, expiresAt, DateTimeOffset.UtcNow);

    [Theory]
    [InlineData(LocalSessionState.SessionStart, LocalSessionState.PaidUnlock)]
    [InlineData(LocalSessionState.PaidUnlock, LocalSessionState.Capture)]
    [InlineData(LocalSessionState.Capture, LocalSessionState.Review)]
    [InlineData(LocalSessionState.Review, LocalSessionState.Edit)]
    [InlineData(LocalSessionState.Edit, LocalSessionState.Review)]
    [InlineData(LocalSessionState.Review, LocalSessionState.Finalize)]
    [InlineData(LocalSessionState.Finalize, LocalSessionState.Print)]
    [InlineData(LocalSessionState.Print, LocalSessionState.OutputManifest)]
    [InlineData(LocalSessionState.OutputManifest, LocalSessionState.PendingSync)]
    [InlineData(LocalSessionState.PendingSync, LocalSessionState.Synced)]
    public void Allows_expected_lifecycle_transitions(LocalSessionState from, LocalSessionState to)
    {
        Assert.True(LocalSessionStateMachine.CanTransition(from, to));
        var result = new LocalSessionStateMachine().Transition(Session(from), to, DateTimeOffset.UtcNow, LocalSessionTransitionReason.Reviewed);
        Assert.Equal(to, result.To);
    }

    [Fact]
    public void Rejects_skipping_paid_unlock()
    {
        Assert.False(LocalSessionStateMachine.CanTransition(LocalSessionState.SessionStart, LocalSessionState.Capture));
        Assert.Throws<InvalidOperationException>(() => new LocalSessionStateMachine().Transition(Session(LocalSessionState.SessionStart), LocalSessionState.Capture, DateTimeOffset.UtcNow, LocalSessionTransitionReason.Captured));
    }

    [Fact]
    public void Timeout_auto_finalizes_only_when_policy_enabled()
    {
        var expires = DateTimeOffset.UtcNow.AddMinutes(-1);
        var machine = new LocalSessionStateMachine();
        Assert.Equal(LocalSessionState.Finalize, machine.Timeout(Session(LocalSessionState.Review, expires), DateTimeOffset.UtcNow, new(true)).To);
        Assert.Equal(LocalSessionState.TimedOut, machine.Timeout(Session(LocalSessionState.Review, expires), DateTimeOffset.UtcNow, new(false)).To);
    }

    [Fact]
    public void Timeout_before_deadline_is_rejected()
    {
        Assert.Throws<InvalidOperationException>(() => new LocalSessionStateMachine().Timeout(Session(LocalSessionState.Capture, DateTimeOffset.UtcNow.AddMinutes(1)), DateTimeOffset.UtcNow, new(true)));
    }

    [Fact]
    public void Synced_and_quarantined_are_terminal()
    {
        Assert.False(LocalSessionStateMachine.CanTransition(LocalSessionState.Synced, LocalSessionState.Capture));
        Assert.False(LocalSessionStateMachine.CanTransition(LocalSessionState.Quarantined, LocalSessionState.Synced));
    }
}
