using System.Threading;

namespace SnapyOS.Wpf.Platform;

public interface IBoothInstanceGuard : IDisposable
{
    bool IsHeld { get; }
}

public sealed class SingleBoothInstanceGuard : IBoothInstanceGuard
{
    private readonly Mutex _mutex;
    private bool _held;

    public SingleBoothInstanceGuard(string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId)) throw new ArgumentException("Device ID is required.", nameof(deviceId));
        var name = "Global\\SnapyOS.Booth.OnePerMachine";
        _mutex = new Mutex(false, name);
        try { _held = _mutex.WaitOne(TimeSpan.Zero); }
        catch (AbandonedMutexException) { _held = true; }
        if (!_held) throw new InvalidOperationException("Another SnapyOS booth is already running on this PC.");
    }

    public bool IsHeld => _held;

    public void Dispose()
    {
        if (!_held) return;
        _held = false;
        _mutex.ReleaseMutex();
        _mutex.Dispose();
    }
}
