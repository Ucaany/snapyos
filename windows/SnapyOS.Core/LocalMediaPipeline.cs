using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Security.Cryptography;

namespace SnapyOS.Core;

public enum MediaOutputFormat { Jpeg, Png }
public enum SlotFit { Cover, Contain, Fill = Cover, Fit = Contain }

public sealed record PhotoInput(string Path, CameraCalibrationProfile? Calibration = null);
public sealed record TemplateSlot(int X, int Y, int Width, int Height, SlotFit Fit = SlotFit.Cover, double RotationDegrees = 0);
public sealed record TextOverlay(string Text, int X, int Y, int Width, int Height, string Color = "#111111", float FontSize = 28);
public sealed record ImageOverlay(string Path, int X, int Y, int Width, int Height);
public sealed record PhotoStripTemplate(
    int Width,
    int Height,
    string BackgroundColor,
    IReadOnlyList<TemplateSlot> Slots,
    IReadOnlyList<TextOverlay> TextOverlays,
    IReadOnlyList<ImageOverlay>? ImageOverlays = null,
    string? LogoPath = null,
    int LogoX = 0,
    int LogoY = 0,
    int? LogoWidth = null,
    int? LogoHeight = null);
public sealed record MediaOutput(string Path, MediaOutputFormat Format, long SizeBytes, string Sha256);

public sealed class LocalMediaPipeline
{
    public MediaOutput RenderPhotoStrip(IReadOnlyList<PhotoInput> photos, PhotoStripTemplate template, string outputPath, MediaOutputFormat format)
    {
        ValidateInputs(photos, template, outputPath, format);
        outputPath = Path.GetFullPath(outputPath);
        var outputDirectory = Path.GetDirectoryName(outputPath) ?? ".";
        Directory.CreateDirectory(outputDirectory);
        var temporaryPath = Path.Combine(outputDirectory, $".{Path.GetFileName(outputPath)}.{Guid.NewGuid():N}.tmp");
        try
        {
            using var canvas = new Bitmap(template.Width, template.Height, PixelFormat.Format32bppArgb);
            using (var graphics = Graphics.FromImage(canvas))
            {
                graphics.SmoothingMode = SmoothingMode.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.Clear(ColorTranslator.FromHtml(template.BackgroundColor));
                for (var index = 0; index < template.Slots.Count; index++)
                {
                    var input = photos[index % photos.Count];
                    using var photo = LoadPhoto(input);
                    DrawSlot(graphics, photo, template.Slots[index]);
                }
                DrawImageOverlays(graphics, template.ImageOverlays ?? []);
                DrawLogo(graphics, template);
                DrawTextOverlays(graphics, template.TextOverlays);
            }
            Save(canvas, temporaryPath, format);
            ReplaceAtomically(temporaryPath, outputPath);
            var info = new FileInfo(outputPath);
            using var output = File.OpenRead(outputPath);
            return new MediaOutput(outputPath, format, info.Length, Convert.ToHexString(SHA256.HashData(output)).ToLowerInvariant());
        }
        finally
        {
            try
            {
                if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
            }
            catch
            {
                // Cleanup must not replace the render error.
            }
        }
    }

    private static Bitmap LoadPhoto(PhotoInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Path)) throw new ArgumentException("Photo path is required.", nameof(input));
        if (!File.Exists(input.Path)) throw new FileNotFoundException("Photo input not found.", input.Path);
        using var source = new Bitmap(input.Path);
        var photo = input.Calibration is null ? new Bitmap(source) : ApplyCalibration(source, input.Calibration);
        return photo;
    }

    private static Bitmap ApplyCalibration(Bitmap source, CameraCalibrationProfile profile)
    {
        var geometry = CalibrationGeometryRenderer.Build(new CameraResolution(source.Width, source.Height), profile);
        var left = Math.Clamp((int)Math.Floor(geometry.CropLeft * source.Width), 0, source.Width - 1);
        var top = Math.Clamp((int)Math.Floor(geometry.CropTop * source.Height), 0, source.Height - 1);
        var right = Math.Clamp((int)Math.Ceiling((geometry.CropLeft + geometry.CropWidth) * source.Width), left + 1, source.Width);
        var bottom = Math.Clamp((int)Math.Ceiling((geometry.CropTop + geometry.CropHeight) * source.Height), top + 1, source.Height);
        var crop = new Bitmap(right - left, bottom - top, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(crop))
            graphics.DrawImage(source, new Rectangle(0, 0, crop.Width, crop.Height), new Rectangle(left, top, crop.Width, crop.Height), GraphicsUnit.Pixel);
        if (profile.Mirror) crop.RotateFlip(RotateFlipType.RotateNoneFlipX);
        crop.RotateFlip(profile.Rotation switch
        {
            CameraRotation.None => RotateFlipType.RotateNoneFlipNone,
            CameraRotation.Clockwise90 => RotateFlipType.Rotate90FlipNone,
            CameraRotation.HalfTurn => RotateFlipType.Rotate180FlipNone,
            CameraRotation.Clockwise270 => RotateFlipType.Rotate270FlipNone,
            _ => throw new ArgumentOutOfRangeException(nameof(profile), "Rotation is unsupported.")
        });
        return crop;
    }

    private static void DrawSlot(Graphics graphics, Bitmap photo, TemplateSlot slot)
    {
        var scale = slot.Fit == SlotFit.Contain
            ? Math.Min((double)slot.Width / photo.Width, (double)slot.Height / photo.Height)
            : Math.Max((double)slot.Width / photo.Width, (double)slot.Height / photo.Height);
        var width = Math.Max(1, (int)Math.Round(photo.Width * scale));
        var height = Math.Max(1, (int)Math.Round(photo.Height * scale));
        var state = graphics.Save();
        graphics.SetClip(new Rectangle(slot.X, slot.Y, slot.Width, slot.Height));
        graphics.TranslateTransform(slot.X + slot.Width / 2f, slot.Y + slot.Height / 2f);
        graphics.RotateTransform((float)slot.RotationDegrees);
        graphics.DrawImage(photo, new Rectangle(-width / 2, -height / 2, width, height));
        graphics.Restore(state);
    }

    private static void DrawImageOverlays(Graphics graphics, IEnumerable<ImageOverlay> overlays)
    {
        foreach (var overlay in overlays)
        {
            using var image = LoadPhoto(new PhotoInput(overlay.Path));
            graphics.DrawImage(image, new Rectangle(overlay.X, overlay.Y, overlay.Width, overlay.Height));
        }
    }

    private static void DrawLogo(Graphics graphics, PhotoStripTemplate template)
    {
        if (string.IsNullOrWhiteSpace(template.LogoPath)) return;
        using var logo = LoadPhoto(new PhotoInput(template.LogoPath));
        var width = template.LogoWidth ?? Math.Min(logo.Width, 240);
        var height = template.LogoHeight ?? Math.Max(1, (int)Math.Round(logo.Height * width / (double)logo.Width));
        graphics.DrawImage(logo, new Rectangle(template.LogoX, template.LogoY, width, height));
    }

    private static void DrawTextOverlays(Graphics graphics, IEnumerable<TextOverlay> overlays)
    {
        foreach (var overlay in overlays)
        {
            using var brush = new SolidBrush(ColorTranslator.FromHtml(overlay.Color));
            using var font = new Font(FontFamily.GenericSansSerif, overlay.FontSize, FontStyle.Bold);
            graphics.DrawString(overlay.Text, font, brush, new RectangleF(overlay.X, overlay.Y, overlay.Width, overlay.Height));
        }
    }

    private static void Save(Bitmap canvas, string path, MediaOutputFormat format)
    {
        using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.SequentialScan);
        canvas.Save(stream, format == MediaOutputFormat.Png ? ImageFormat.Png : ImageFormat.Jpeg);
        stream.Flush(true);
    }

    private static void ReplaceAtomically(string temporaryPath, string outputPath) => File.Move(temporaryPath, outputPath, true);

    private static void ValidateInputs(IReadOnlyList<PhotoInput> photos, PhotoStripTemplate template, string outputPath, MediaOutputFormat format)
    {
        if (photos is null || photos.Count == 0) throw new ArgumentException("At least one photo is required.", nameof(photos));
        if (photos.Any(photo => photo is null)) throw new ArgumentException("Photo inputs cannot be null.", nameof(photos));
        ArgumentNullException.ThrowIfNull(template);
        if (!Enum.IsDefined(format)) throw new ArgumentOutOfRangeException(nameof(format));
        if (template.Width <= 0 || template.Height <= 0) throw new ArgumentOutOfRangeException(nameof(template), "Template dimensions must be positive.");
        if (template.Slots is null || template.Slots.Count == 0) throw new ArgumentException("Template must contain slots.", nameof(template));
        if (template.TextOverlays is null) throw new ArgumentException("Text overlays cannot be null.", nameof(template));
        if (string.IsNullOrWhiteSpace(outputPath) || IsRemoteUri(outputPath)) throw new ArgumentException("Only local filesystem paths are supported.", nameof(outputPath));
        var fullOutputPath = Path.GetFullPath(outputPath);
        ColorTranslator.FromHtml(template.BackgroundColor);
        foreach (var photo in photos)
        {
            ValidateLocalPath(photo.Path, nameof(photos));
            if (PathsEqual(photo.Path, fullOutputPath)) throw new ArgumentException("Output path cannot be a photo input.", nameof(outputPath));
        }
        foreach (var slot in template.Slots)
        {
            if (slot is null || !Enum.IsDefined(slot.Fit) || !double.IsFinite(slot.RotationDegrees)) throw new ArgumentOutOfRangeException(nameof(template), "Slots contain an invalid value.");
            ValidateRectangle(slot.X, slot.Y, slot.Width, slot.Height, template, nameof(template.Slots));
        }
        foreach (var overlay in template.ImageOverlays ?? [])
        {
            if (overlay is null) throw new ArgumentException("Image overlays cannot contain null values.", nameof(template));
            ValidateLocalPath(overlay.Path, nameof(template.ImageOverlays));
            if (PathsEqual(overlay.Path, fullOutputPath)) throw new ArgumentException("Output path cannot be an overlay input.", nameof(outputPath));
            ValidateRectangle(overlay.X, overlay.Y, overlay.Width, overlay.Height, template, nameof(template.ImageOverlays));
        }
        foreach (var overlay in template.TextOverlays)
        {
            if (overlay is null) throw new ArgumentException("Text overlays cannot contain null values.", nameof(template));
            ValidateRectangle(overlay.X, overlay.Y, overlay.Width, overlay.Height, template, nameof(template.TextOverlays));
            if (string.IsNullOrWhiteSpace(overlay.Text) || !float.IsFinite(overlay.FontSize) || overlay.FontSize <= 0) throw new ArgumentException("Text overlay must contain text and a positive font size.", nameof(template));
            ColorTranslator.FromHtml(overlay.Color);
        }
        if (template.LogoWidth is <= 0 || template.LogoHeight is <= 0) throw new ArgumentOutOfRangeException(nameof(template), "Logo dimensions must be positive.");
        if (!string.IsNullOrWhiteSpace(template.LogoPath))
        {
            ValidateLocalPath(template.LogoPath, nameof(template.LogoPath));
            if (PathsEqual(template.LogoPath, fullOutputPath)) throw new ArgumentException("Output path cannot be the logo input.", nameof(outputPath));
            using var logo = new Bitmap(template.LogoPath);
            var width = template.LogoWidth ?? Math.Min(logo.Width, 240);
            var height = template.LogoHeight ?? Math.Max(1, (int)Math.Round(logo.Height * width / (double)logo.Width));
            ValidateRectangle(template.LogoX, template.LogoY, width, height, template, nameof(template.LogoPath));
        }
    }

    private static void ValidateLocalPath(string path, string parameter)
    {
        if (string.IsNullOrWhiteSpace(path) || IsRemoteUri(path))
            throw new ArgumentException("Only local filesystem paths are supported.", parameter);
        if (!File.Exists(path)) throw new FileNotFoundException("Input file not found.", path);
    }

    private static bool IsRemoteUri(string path)
    {
        if (Path.IsPathRooted(path)) return OperatingSystem.IsWindows() && path.StartsWith("\\\\", StringComparison.Ordinal);
        return Uri.TryCreate(path, UriKind.Absolute, out var uri) && !string.IsNullOrWhiteSpace(uri.Scheme);
    }

    private static bool PathsEqual(string left, string right) =>
        string.Equals(Path.GetFullPath(left), right, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    private static void ValidateRectangle(int x, int y, int width, int height, PhotoStripTemplate template, string parameter)
    {
        if (width <= 0 || height <= 0 || x < 0 || y < 0 || x > template.Width - width || y > template.Height - height)
            throw new ArgumentOutOfRangeException(parameter, "Rectangle must be positive and inside the template.");
    }
}

