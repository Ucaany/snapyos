using System.Collections.Concurrent;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class UvcCameraTests
{
    [Fact]
    public async Task Enumeration_normalizes_stable_identity()
    {
        var backend = new FakeUvcBackend([new UvcDeviceDescriptor("", "Camera", "Acme", "C1", "instance", "path", [new(1280, 720)], [new(30)])]);
        var devices = await WindowsUvcCameraAdapter.EnumerateAsync(backend);
        Assert.StartsWith("uvc-", devices[0].StableId);
    }

    [Fact]
    public async Task Capture_honors_transform_and_resolution()
    {
        var device = Device("camera-a");
        var backend = new FakeUvcBackend([device]);
        await using var camera = new WindowsUvcCameraAdapter(backend, device, new(new(1280, 720), new(60), true, CameraRotation.Clockwise90, TimeSpan.FromSeconds(1)));
        var frame = await camera.CaptureStillAsync();
        Assert.True(frame.Mirrored);
        Assert.Equal(CameraRotation.Clockwise90, frame.Rotation);
        Assert.Equal(1280, frame.Resolution.Width);
    }

    [Fact]
    public async Task Exclusive_access_blocks_second_adapter()
    {
        var device = Device("camera-exclusive");
        var backend = new FakeUvcBackend([device]);
        await using var first = new WindowsUvcCameraAdapter(backend, device);
        await using var second = new WindowsUvcCameraAdapter(backend, device);
        await first.StartPreviewAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => second.StartPreviewAsync());
        Assert.Equal(CameraHealthState.Busy, second.Health);
    }

    [Fact]
    public async Task Reconnect_reopens_session()
    {
        var device = Device("camera-reconnect");
        var backend = new FakeUvcBackend([device]);
        await using var camera = new WindowsUvcCameraAdapter(backend, device);
        await camera.StartPreviewAsync();
        Assert.True(await camera.ReconnectAsync());
        Assert.Equal(CameraHealthState.Ready, camera.Health);
    }

    [Fact]
    public async Task Timeout_and_cancellation_are_propagated()
    {
        var device = Device("camera-timeout");
        var backend = new FakeUvcBackend([device]) { Delay = TimeSpan.FromSeconds(1) };
        await using var camera = new WindowsUvcCameraAdapter(backend, device, new UvcCameraOptions(new(640, 480), new(30), false, CameraRotation.None, TimeSpan.FromMilliseconds(10)));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => camera.CaptureStillAsync());
    }

    [Fact]
    public async Task Preview_stream_honors_cancellation_and_health()
    {
        var device = Device("camera-preview");
        await using var camera = new FakeUvcCameraAdapter(device, new(new(640, 480), new(30), true, CameraRotation.HalfTurn, TimeSpan.FromSeconds(1)));
        using var cts = new CancellationTokenSource();
        await using var frames = camera.PreviewAsync(cts.Token).GetAsyncEnumerator();
        Assert.True(await frames.MoveNextAsync());
        Assert.Equal(CameraHealthState.Streaming, camera.Health);
        Assert.True(frames.Current.Mirrored);
        Assert.Equal(CameraRotation.HalfTurn, frames.Current.Rotation);
        cts.Cancel();
        await frames.DisposeAsync();
    }

    [Fact]
    public async Task Unsupported_resolution_is_rejected()
    {
        var device = Device("camera-resolution");
        await using var camera = new WindowsUvcCameraAdapter(new FakeUvcBackend([device]), device, new(new(800, 600), new(30), false, CameraRotation.None, TimeSpan.FromSeconds(1)));
        await Assert.ThrowsAsync<NotSupportedException>(() => camera.StartPreviewAsync());
    }

    private static UvcDeviceDescriptor Device(string id) => new(id, "Fake Camera", "Acme", id, id, $"path-{id}", [new(640, 480), new(1280, 720), new(1920, 1080)], [new(30), new(60)]);

    private sealed class FakeUvcBackend(IReadOnlyList<UvcDeviceDescriptor> devices) : IWindowsUvcBackend
    {
        public TimeSpan Delay { get; init; }
        public Task<IReadOnlyList<UvcDeviceDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default) => Task.FromResult(devices);
        public async Task<IWindowsUvcSession> OpenAsync(UvcDeviceDescriptor device, UvcCameraOptions options, CancellationToken cancellationToken = default)
        {
            await Task.Delay(Delay, cancellationToken);
            return new FakeSession(options);
        }
    }

    private sealed class FakeSession(UvcCameraOptions options) : IWindowsUvcSession
    {
        public Task<CameraFrame> ReadPreviewAsync(CancellationToken cancellationToken) => Task.FromResult(Frame());
        public Task<CameraFrame> CaptureStillAsync(CancellationToken cancellationToken) => Task.FromResult(Frame());
        public Task SetTransformAsync(bool mirror, CameraRotation rotation, CancellationToken cancellationToken) => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        private CameraFrame Frame() => new(new byte[] { 1 }, options.Resolution, options.FrameRate, options.Mirror, options.Rotation, DateTimeOffset.UtcNow);
    }
}
