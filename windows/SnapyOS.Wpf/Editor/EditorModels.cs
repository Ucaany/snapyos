using System.Collections.ObjectModel;
using SnapyOS.Contracts;
using SnapyOS.Wpf.Mvvm;

namespace SnapyOS.Wpf.Editor;

public readonly record struct EditorInsets(double Left, double Top, double Right, double Bottom)
{
    public static EditorInsets None => new(0, 0, 0, 0);
}

public readonly record struct EditorBounds(double X, double Y, double Width, double Height)
{
    public double Right => X + Width;
    public double Bottom => Y + Height;
}

public enum EditorFit { Cover, Contain, Fill }
public enum EditorAlignment { Left, Center, Right }
public enum EditorOverflow { Visible, Hidden, Clip }

public sealed class EditorProperties : ObservableObject
{
    private string _fontFamily = "sans";
    private double _fontSize = 28;
    private int _fontWeight = 400;
    private double _lineHeight = 1.2;
    private double _letterSpacing;
    private string _color = "#111111";
    private string _background = "#FFFFFF";
    private double _opacity = 1;
    private EditorFit _fit = EditorFit.Cover;
    private string? _poster;
    private bool _autoplay;
    private bool _loop;
    private bool _muted = true;
    private EditorAlignment _alignment = EditorAlignment.Left;
    private double? _maxWidth;
    private EditorOverflow _overflow = EditorOverflow.Visible;

    public string FontFamily { get => _fontFamily; set => SetProperty(ref _fontFamily, value); }
    public double FontSize { get => _fontSize; set => SetProperty(ref _fontSize, Math.Clamp(value, 8, 240)); }
    public int FontWeight { get => _fontWeight; set => SetProperty(ref _fontWeight, Math.Clamp(value, 400, 900)); }
    public double LineHeight { get => _lineHeight; set => SetProperty(ref _lineHeight, Math.Clamp(value, 0.8, 3)); }
    public double LetterSpacing { get => _letterSpacing; set => SetProperty(ref _letterSpacing, Math.Clamp(value, -0.2, 2)); }
    public string Color { get => _color; set => SetProperty(ref _color, value); }
    public string Background { get => _background; set => SetProperty(ref _background, value); }
    public double Opacity { get => _opacity; set => SetProperty(ref _opacity, Math.Clamp(value, 0, 1)); }
    public EditorFit Fit { get => _fit; set => SetProperty(ref _fit, value); }
    public string? Poster { get => _poster; set => SetProperty(ref _poster, value); }
    public bool Autoplay { get => _autoplay; set => SetProperty(ref _autoplay, value); }
    public bool Loop { get => _loop; set => SetProperty(ref _loop, value); }
    public bool Muted { get => _muted; set => SetProperty(ref _muted, value); }
    public EditorAlignment Alignment { get => _alignment; set => SetProperty(ref _alignment, value); }
    public double? MaxWidth { get => _maxWidth; set => SetProperty(ref _maxWidth, value is null ? null : Math.Clamp(value.Value, 1, 3000)); }
    public EditorOverflow Overflow { get => _overflow; set => SetProperty(ref _overflow, value); }
}

public sealed class EditorOrientationProfile : ObservableObject
{
    private string _name = "landscape";
    private double _canvasWidth = 1200;
    private double _canvasHeight = 800;
    private EditorInsets _safeArea = new(32, 32, 32, 32);

    public string Name { get => _name; set => SetProperty(ref _name, value); }
    public double CanvasWidth { get => _canvasWidth; set => SetProperty(ref _canvasWidth, Math.Max(1, value)); }
    public double CanvasHeight { get => _canvasHeight; set => SetProperty(ref _canvasHeight, Math.Max(1, value)); }
    public EditorInsets SafeArea { get => _safeArea; set => SetProperty(ref _safeArea, value); }
}

public sealed class EditorElementModel : ObservableObject
{
    private double _x;
    private double _y;
    private double _width = 160;
    private double _height = 80;
    private int _zIndex;
    private bool _isVisible = true;
    private bool _isLocked;
    private string? _groupId;
    private double _rotation;
    private string _shape = "rect";
    private double _radius;
    private EditorProperties _properties = new();

    public EditorElementModel(string elementId, ElementKind kind, string purpose)
    {
        if (string.IsNullOrWhiteSpace(elementId)) throw new ArgumentException("Element ID is required.", nameof(elementId));
        if (string.IsNullOrWhiteSpace(purpose)) throw new ArgumentException("Element purpose is required.", nameof(purpose));
        ElementId = elementId;
        Kind = kind;
        Purpose = purpose;
    }

    public string ElementId { get; }
    public ElementKind Kind { get; }
    public string Purpose { get; }
    public string? AssetReference { get; set; }
    public string? OrientationProfile { get; set; }
    public string? Text { get; set; }
    public Dictionary<string, string> Style { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, string> Bindings { get; } = new(StringComparer.Ordinal);
    public double X { get => _x; set => SetProperty(ref _x, value); }
    public double Y { get => _y; set => SetProperty(ref _y, value); }
    public double Width { get => _width; set => SetProperty(ref _width, Math.Max(1, value)); }
    public double Height { get => _height; set => SetProperty(ref _height, Math.Max(1, value)); }
    public int ZIndex { get => _zIndex; set => SetProperty(ref _zIndex, value); }
    public bool IsVisible { get => _isVisible; set => SetProperty(ref _isVisible, value); }
    public bool IsLocked { get => _isLocked; set => SetProperty(ref _isLocked, value); }
    public string? GroupId { get => _groupId; set => SetProperty(ref _groupId, value); }
    public double Rotation { get => _rotation; set => SetProperty(ref _rotation, Math.Clamp(value, -180, 180)); }
    public string Shape { get => _shape; set => SetProperty(ref _shape, value); }
    public double Radius { get => _radius; set => SetProperty(ref _radius, Math.Max(0, value)); }
    public EditorProperties Properties { get => _properties; set => SetProperty(ref _properties, value); }
    public EditorBounds Bounds => new(X, Y, Width, Height);
}

public sealed class EditorCanvasModel : ObservableObject
{
    public EditorCanvasModel()
    {
        Orientation = new EditorOrientationProfile();
    }

    public ObservableCollection<EditorElementModel> Elements { get; } = [];
    public EditorOrientationProfile Orientation { get; }
    public int SnapGridSize { get; set; } = 8;
    public EditorInsets SafeArea => Orientation.SafeArea;
}
