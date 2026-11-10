using System.Drawing;
using System.Drawing.Imaging;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class LocalMediaPipelineTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-media-{Guid.NewGuid():N}");

    public LocalMediaPipelineTests() => Directory.CreateDirectory(_root);

    [Fact]
    public void Render_is_deterministic_and_cleans_temporary_files()
    {
        var photo = MakeImage("photo.png", 10, 10, (_, _) => Color.Red);
        var output = Path.Combine(_root, "strip.png");
        var template = new PhotoStripTemplate(100, 200, "#FFFFFF", [new(0, 0, 100, 200)], []);
        var pipeline = new LocalMediaPipeline();

        var first = pipeline.RenderPhotoStrip([new(photo)], template, output, MediaOutputFormat.Png);
        var firstBytes = File.ReadAllBytes(output);
        var second = pipeline.RenderPhotoStrip([new(photo)], template, output, MediaOutputFormat.Png);

        Assert.Equal(first.Sha256, second.Sha256);
        Assert.Equal(firstBytes, File.ReadAllBytes(output));
        Assert.Equal(firstBytes.Length, second.SizeBytes);
        using var hashed = File.OpenRead(output);
        Assert.Equal(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(hashed)).ToLowerInvariant(), second.Sha256);
        Assert.DoesNotContain(Directory.GetFiles(_root), path => path.EndsWith(".tmp", StringComparison.Ordinal));
    }

    [Fact]
    public void Calibration_applies_crop_mirror_and_orientation_before_fit()
    {
        var photo = MakeImage("photo.png", 4, 2, (x, _) => x < 2 ? Color.Red : Color.Blue);
        var output = Path.Combine(_root, "strip.png");
        var calibration = new CameraCalibrationProfile("camera", MonitorOrientation.Landscape, 0, 0, 1, 1, CameraRotation.None, true, new(0, 0, 1, 1), CalibrationGridStyle.SafeFrame, DateTimeOffset.UnixEpoch);
        var template = new PhotoStripTemplate(4, 2, "#FFFFFF", [new(0, 0, 4, 2, SlotFit.Contain)], [], []);

        new LocalMediaPipeline().RenderPhotoStrip([new(photo, calibration)], template, output, MediaOutputFormat.Png);

        using var result = new Bitmap(output);
        Assert.Equal(Color.Blue.ToArgb(), result.GetPixel(0, 1).ToArgb());
        Assert.Equal(Color.Red.ToArgb(), result.GetPixel(3, 1).ToArgb());
    }

    [Theory]
    [InlineData(CameraRotation.None, false)]
    [InlineData(CameraRotation.None, true)]
    [InlineData(CameraRotation.Clockwise90, false)]
    [InlineData(CameraRotation.Clockwise90, true)]
    [InlineData(CameraRotation.HalfTurn, false)]
    [InlineData(CameraRotation.HalfTurn, true)]
    [InlineData(CameraRotation.Clockwise270, false)]
    [InlineData(CameraRotation.Clockwise270, true)]
    public void Calibration_rotation_and_mirror_produce_expected_dimensions(CameraRotation rotation, bool mirror)
    {
        var photo = MakeImage("rotation.png", 4, 2, (x, y) => (x, y) switch
        {
            (0, 0) => Color.Red,
            (3, 0) => Color.Green,
            (0, 1) => Color.Blue,
            (3, 1) => Color.Yellow,
            _ => Color.White
        });
        var output = Path.Combine(_root, $"rotation-{(int)rotation}-{mirror}.png");
        var calibration = new CameraCalibrationProfile("camera", MonitorOrientation.Landscape, 0, 0, 1, 1, rotation, mirror, new(0, 0, 1, 1), CalibrationGridStyle.SafeFrame, DateTimeOffset.UnixEpoch);
        var template = new PhotoStripTemplate(4, 4, "#FFFFFF", [new(0, 0, 4, 4, SlotFit.Contain)], [], []);

        new LocalMediaPipeline().RenderPhotoStrip([new(photo, calibration)], template, output, MediaOutputFormat.Png);

        using var result = new Bitmap(output);
        Assert.Equal(4, result.Width);
        Assert.Equal(4, result.Height);
    }

    [Fact]
    public void Calibration_mirror_precedes_clockwise_rotation()
    {
        var photo = MakeImage("orientation.png", 2, 2, (x, y) => (x, y) switch
        {
            (0, 0) => Color.Red,
            (1, 0) => Color.Green,
            (0, 1) => Color.Blue,
            _ => Color.Yellow
        });
        var output = Path.Combine(_root, "orientation-result.png");
        var calibration = new CameraCalibrationProfile("camera", MonitorOrientation.Landscape, 0, 0, 1, 1, CameraRotation.Clockwise90, true, new(0, 0, 1, 1), CalibrationGridStyle.SafeFrame, DateTimeOffset.UnixEpoch);
        var template = new PhotoStripTemplate(2, 2, "#FFFFFF", [new(0, 0, 2, 2, SlotFit.Contain)], [], []);

        new LocalMediaPipeline().RenderPhotoStrip([new(photo, calibration)], template, output, MediaOutputFormat.Png);

        using var result = new Bitmap(output);
        Assert.Equal(Color.Yellow.ToArgb(), result.GetPixel(0, 0).ToArgb());
        Assert.Equal(Color.Green.ToArgb(), result.GetPixel(1, 0).ToArgb());
        Assert.Equal(Color.Blue.ToArgb(), result.GetPixel(0, 1).ToArgb());
        Assert.Equal(Color.Red.ToArgb(), result.GetPixel(1, 1).ToArgb());
    }

    [Fact]
    public void Overlay_and_logo_are_drawn_at_declared_positions()
    {
        var photo = MakeImage("photo.png", 4, 4, (_, _) => Color.White);
        var overlay = MakeImage("overlay.png", 2, 2, (_, _) => Color.Green);
        var logo = MakeImage("logo.png", 1, 1, (_, _) => Color.Blue);
        var output = Path.Combine(_root, "strip.png");
        var template = new PhotoStripTemplate(10, 10, "#FFFFFF", [new(0, 0, 10, 10)], [], [new(overlay, 2, 3, 2, 2)], logo, 7, 8, 1, 1);

        new LocalMediaPipeline().RenderPhotoStrip([new(photo)], template, output, MediaOutputFormat.Png);

        using var result = new Bitmap(output);
        Assert.Equal(Color.Green.ToArgb(), result.GetPixel(2, 3).ToArgb());
        Assert.Equal(Color.Blue.ToArgb(), result.GetPixel(7, 8).ToArgb());
    }

    [Theory]
    [InlineData(MediaOutputFormat.Png, "89504E47")]
    [InlineData(MediaOutputFormat.Jpeg, "FFD8")]
    public void Output_signature_matches_requested_format(MediaOutputFormat format, string signatureHex)
    {
        var signature = Convert.FromHexString(signatureHex);
        var photo = MakeImage("photo.png", 2, 2, (_, _) => Color.Red);
        var output = Path.Combine(_root, format == MediaOutputFormat.Png ? "strip.png" : "strip.jpg");
        var template = new PhotoStripTemplate(2, 2, "#FFFFFF", [new(0, 0, 2, 2)], [], []);

        var result = new LocalMediaPipeline().RenderPhotoStrip([new(photo)], template, output, format);
        Assert.Equal(signature, File.ReadAllBytes(output)[..signature.Length]);
        Assert.Equal(format, result.Format);
        Assert.Equal(64, result.Sha256.Length);
    }

    [Fact]
    public void Invalid_slot_fails_without_creating_output()
    {
        var photo = MakeImage("photo.png", 2, 2, (_, _) => Color.Red);
        var output = Path.Combine(_root, "strip.png");
        var template = new PhotoStripTemplate(10, 10, "#FFFFFF", [new(9, 9, 2, 2)], [], []);

        Assert.Throws<ArgumentOutOfRangeException>(() => new LocalMediaPipeline().RenderPhotoStrip([new(photo)], template, output, MediaOutputFormat.Png));
        Assert.False(File.Exists(output));
        Assert.Empty(Directory.GetFiles(_root, "*.tmp"));
    }

    [Fact]
    public void Missing_photo_fails_without_replacing_existing_output()
    {
        var output = Path.Combine(_root, "strip.jpg");
        var existing = MakeImage("existing.png", 2, 2, (_, _) => Color.Green);
        File.Copy(existing, output);
        var template = new PhotoStripTemplate(100, 100, "#FFFFFF", [new(0, 0, 100, 100)], [], []);

        Assert.Throws<FileNotFoundException>(() => new LocalMediaPipeline().RenderPhotoStrip([new(Path.Combine(_root, "missing.jpg"))], template, output, MediaOutputFormat.Jpeg));
        Assert.Equal(File.ReadAllBytes(existing), File.ReadAllBytes(output));
    }

    private string MakeImage(string name, int width, int height, Func<int, int, Color> color)
    {
        var path = Path.Combine(_root, name);
        using var image = new Bitmap(width, height);
        using (var graphics = Graphics.FromImage(image))
        {
            for (var y = 0; y < height; y++)
            for (var x = 0; x < width; x++)
            using (var brush = new SolidBrush(color(x, y)))
                graphics.FillRectangle(brush, x, y, 1, 1);
        }
        image.Save(path, ImageFormat.Png);
        return path;
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, true); } catch { }
    }
}
