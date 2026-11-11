using System.ComponentModel.DataAnnotations;

namespace SnapyOS.Core;

public enum MonitorOrientation { Unknown, Portrait, Landscape }
public enum CalibrationGridStyle { RuleOfThirds, CenterCross, SafeFrame }

public sealed record MonitorDescriptor(
    [property: Required] string MonitorId,
    [property: Required] string Name,
    int PixelWidth,
    int PixelHeight,
    double DpiScale,
    MonitorOrientation Orientation)
{
    public MonitorOrientation DetectedOrientation => MonitorOrientationDetector.Detect(PixelWidth, PixelHeight);
}

public interface IMonitorProvider
{
    Task<IReadOnlyList<MonitorDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default);
}

public sealed class MonitorDiscoveryService(IMonitorProvider provider)
{
    public async Task<IReadOnlyList<MonitorDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default)
    {
        var monitors = await provider.EnumerateAsync(cancellationToken).ConfigureAwait(false);
        return monitors.Select(monitor => monitor with { Orientation = MonitorOrientationDetector.Detect(monitor.PixelWidth, monitor.PixelHeight) }).ToArray();
    }
}

public sealed class FakeMonitorProvider(IReadOnlyList<MonitorDescriptor> monitors) : IMonitorProvider
{
    public Task<IReadOnlyList<MonitorDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(monitors);
    }
}

public static class MonitorOrientationDetector
{
    public static MonitorOrientation Detect(int width, int height) => width == height
        ? MonitorOrientation.Unknown
        : width > height ? MonitorOrientation.Landscape : MonitorOrientation.Portrait;
}

public sealed record SafeArea(double Left, double Top, double Right, double Bottom)
{
    public bool Contains(double x, double y) => x >= Left && x <= Right && y >= Top && y <= Bottom;
}

public sealed record CameraCalibrationProfile(
    [property: Required] string CameraId,
    [property: Required] MonitorOrientation Orientation,
    double CropLeft,
    double CropTop,
    double CropWidth,
    double CropHeight,
    CameraRotation Rotation,
    bool Mirror,
    SafeArea SafeArea,
    CalibrationGridStyle GridStyle,
    DateTimeOffset UpdatedAt)
{
    public static CameraCalibrationProfile Default(string cameraId, MonitorOrientation orientation) =>
        new(cameraId, orientation, 0, 0, 1, 1, CameraRotation.None, false, new(0, 0, 1, 1), CalibrationGridStyle.SafeFrame, DateTimeOffset.UtcNow);
}

public static class CalibrationCaptureValidator
{
    public static void Validate(CalibrationCapture capture)
    {
        if (string.IsNullOrWhiteSpace(capture.CameraId)) throw new ArgumentException("Camera ID is required.", nameof(capture));
        if (capture.Monitor.PixelWidth <= 0 || capture.Monitor.PixelHeight <= 0) throw new ArgumentOutOfRangeException(nameof(capture), "Monitor resolution must be positive.");
        if (capture.Monitor.DpiScale <= 0) throw new ArgumentOutOfRangeException(nameof(capture), "DPI scale must be positive.");
        if (capture.Image.IsEmpty) throw new ArgumentException("Calibration image is required.", nameof(capture));
    }
}

public sealed record CalibrationCapture(
    string CameraId,
    MonitorDescriptor Monitor,
    ReadOnlyMemory<byte> Image,
    DateTimeOffset CapturedAt);

public sealed record CalibrationGeometry(
    double SourceWidth,
    double SourceHeight,
    double CropLeft,
    double CropTop,
    double CropWidth,
    double CropHeight,
    CameraRotation Rotation,
    bool Mirror,
    SafeArea SafeArea,
    CalibrationGridStyle GridStyle);

public static class CalibrationGeometryRenderer
{
    public static CalibrationGeometry Build(CameraResolution source, CameraCalibrationProfile profile)
    {
        Validate(profile);
        return new CalibrationGeometry(source.Width, source.Height, profile.CropLeft, profile.CropTop, profile.CropWidth, profile.CropHeight, profile.Rotation, profile.Mirror, profile.SafeArea, profile.GridStyle);
    }

    public static (double Width, double Height) RotatedSize(CalibrationGeometry geometry) =>
        geometry.Rotation is CameraRotation.Clockwise90 or CameraRotation.Clockwise270
            ? (geometry.CropHeight, geometry.CropWidth)
            : (geometry.CropWidth, geometry.CropHeight);

    public static (double X, double Y) MapSourcePoint(CalibrationGeometry geometry, double x, double y)
    {
        var nx = (x - geometry.CropLeft) / geometry.CropWidth;
        var ny = (y - geometry.CropTop) / geometry.CropHeight;
        if (geometry.Mirror) nx = 1 - nx;
        return geometry.Rotation switch
        {
            CameraRotation.Clockwise90 => (1 - ny, nx),
            CameraRotation.HalfTurn => (1 - nx, 1 - ny),
            CameraRotation.Clockwise270 => (ny, 1 - nx),
            _ => (nx, ny)
        };
    }

    private static void Validate(CameraCalibrationProfile profile)
    {
        if (profile.CropLeft < 0 || profile.CropTop < 0 || profile.CropWidth <= 0 || profile.CropHeight <= 0 || profile.CropLeft + profile.CropWidth > 1 || profile.CropTop + profile.CropHeight > 1)
            throw new ArgumentOutOfRangeException(nameof(profile), "Crop must be normalized and remain inside the source frame.");
        if (profile.SafeArea.Left < 0 || profile.SafeArea.Top < 0 || profile.SafeArea.Right > 1 || profile.SafeArea.Bottom > 1 || profile.SafeArea.Left >= profile.SafeArea.Right || profile.SafeArea.Top >= profile.SafeArea.Bottom)
            throw new ArgumentOutOfRangeException(nameof(profile), "Safe area must be normalized and ordered.");
    }
}
