using System.Drawing;
using System.Drawing.Imaging;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class LocalGifRendererTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-gif-{Guid.NewGuid():N}");

    public LocalGifRendererTests() => Directory.CreateDirectory(_root);

    [Fact]
    public async Task Renders_ordered_frames_with_checksum_and_cleanup()
    {
        var first = MakeFrame("first.png", Color.Red);
        var second = MakeFrame("second.png", Color.Blue);
        var output = Path.Combine(_root, "result.gif");
        var result = await new LocalGifRenderer().RenderAsync([new(first, TimeSpan.FromMilliseconds(100)), new(second, TimeSpan.FromMilliseconds(200))], output);
        Assert.Equal(2, result.FrameCount);
        Assert.Equal(64, result.Sha256.Length);
        Assert.True(File.Exists(output));
        Assert.Empty(Directory.GetFiles(_root, "*.tmp", SearchOption.TopDirectoryOnly));
    }

    [Fact]
    public async Task Invalid_input_and_memory_limit_are_rejected()
    {
        await Assert.ThrowsAsync<ArgumentException>(() => new LocalGifRenderer().RenderAsync([], Path.Combine(_root, "empty.gif")));
        var frame = MakeFrame("large.png", Color.Green);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new LocalGifRenderer().RenderAsync([new(frame, TimeSpan.FromSeconds(1))], Path.Combine(_root, "large.gif"), new LocalGifOptions(MaxMemoryBytes: 1)));
    }

    [Fact]
    public async Task Orientation_mismatch_is_rejected()
    {
        var first = MakeFrame("a.png", Color.Red, 10, 10);
        var second = MakeFrame("b.png", Color.Blue, 20, 10);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new LocalGifRenderer().RenderAsync([new(first, TimeSpan.FromSeconds(1)), new(second, TimeSpan.FromSeconds(1))], Path.Combine(_root, "bad.gif")));
    }

    [Fact]
    public async Task Cancellation_removes_temporary_and_final_files()
    {
        var frame = MakeFrame("cancel.png", Color.Green, 500, 500);
        var output = Path.Combine(_root, "cancel.gif");
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => new LocalGifRenderer().RenderAsync([new(frame, TimeSpan.FromSeconds(1))], output, cancellationToken: cancellation.Token));
        Assert.False(File.Exists(output));
        Assert.Empty(Directory.GetFiles(_root, "*.tmp", SearchOption.TopDirectoryOnly));
    }

    [Fact]
    public async Task Rejects_remote_input_and_output_overwrite()
    {
        var output = Path.Combine(_root, "result.gif");
        await Assert.ThrowsAsync<ArgumentException>(() => new LocalGifRenderer().RenderAsync([new("https://example.test/frame.png", TimeSpan.FromSeconds(1))], output));
        var frame = MakeFrame("same.png", Color.Red);
        await Assert.ThrowsAsync<ArgumentException>(() => new LocalGifRenderer().RenderAsync([new(frame, TimeSpan.FromSeconds(1))], frame));
    }

    private string MakeFrame(string name, Color color, int width = 10, int height = 10)
    {
        var path = Path.Combine(_root, name);
        using var image = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(image);
        graphics.Clear(color);
        image.Save(path, ImageFormat.Png);
        return path;
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, true); } catch { }
    }
}
