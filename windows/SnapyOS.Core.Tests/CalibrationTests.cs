using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class CalibrationTests
{
    [Fact]
    public async Task Monitor_discovery_detects_orientation()
    {
        var service = new MonitorDiscoveryService(new FakeMonitorProvider([
            new("portrait", "Portrait", 1080, 1920, 1.25, MonitorOrientation.Unknown),
            new("landscape", "Landscape", 1920, 1080, 1, MonitorOrientation.Unknown)
        ]));
        var monitors = await service.EnumerateAsync();
        Assert.Equal(MonitorOrientation.Portrait, monitors[0].Orientation);
        Assert.Equal(MonitorOrientation.Landscape, monitors[1].DetectedOrientation);
        Assert.Equal(1.25, monitors[0].DpiScale);
    }

    [Fact]
    public void Default_profile_and_capture_validation_are_safe()
    {
        var profile = CameraCalibrationProfile.Default("camera", MonitorOrientation.Portrait);
        Assert.Equal(MonitorOrientation.Portrait, profile.Orientation);
        Assert.Throws<ArgumentException>(() => CalibrationCaptureValidator.Validate(new("camera", new("monitor", "Monitor", 1920, 1080, 1, MonitorOrientation.Landscape), ReadOnlyMemory<byte>.Empty, DateTimeOffset.UtcNow)));
    }

    [Fact]
    public void Portrait_profile_rotates_geometry()
    {
        var profile = Profile(MonitorOrientation.Portrait, CameraRotation.Clockwise90);
        var geometry = CalibrationGeometryRenderer.Build(new(1920, 1080), profile);
        Assert.Equal((0.8, 0.6), CalibrationGeometryRenderer.RotatedSize(geometry));
    }

    [Fact]
    public void Crop_mirror_and_rotation_map_source_point()
    {
        var geometry = CalibrationGeometryRenderer.Build(new(1000, 1000), Profile(MonitorOrientation.Landscape, CameraRotation.None) with { Mirror = true });
        var point = CalibrationGeometryRenderer.MapSourcePoint(geometry, 0.2, 0.2);
        Assert.Equal(0.8, point.X, 3);
        Assert.Equal(0.2, point.Y, 3);
    }

    [Fact]
    public void Invalid_crop_is_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => CalibrationGeometryRenderer.Build(new(100, 100), Profile(MonitorOrientation.Landscape, CameraRotation.None) with { CropWidth = 1.1 }));
    }

    private static CameraCalibrationProfile Profile(MonitorOrientation orientation, CameraRotation rotation) => new("camera", orientation, 0.1, 0.1, 0.8, 0.8, rotation, false, new(0.05, 0.05, 0.95, 0.95), CalibrationGridStyle.RuleOfThirds, DateTimeOffset.UtcNow);
}
