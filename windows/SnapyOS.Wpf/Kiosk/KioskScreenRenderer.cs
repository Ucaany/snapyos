using System.Windows;
using System.Windows.Controls;
using System.Windows.Automation;
using System.Windows.Input;
using System.Windows.Media;
using SnapyOS.Contracts;

namespace SnapyOS.Wpf.Kiosk;

public interface IKioskScreenRenderer
{
    FrameworkElement Render(KioskRenderRequest request);
}

public sealed class KioskScreenRenderer : IKioskScreenRenderer
{
    public FrameworkElement Render(KioskRenderRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var config = request.Config;
        var layout = config.Layout;
        var root = new Grid
        {
            MinWidth = 320,
            MinHeight = 240,
            Background = Brush(config.Theme.BackgroundColor),
            SnapsToDevicePixels = true,
            Focusable = true
        };
        AutomationProperties.SetName(root, $"Kiosk {config.Screen}");

        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.Children.Add(Header(config));

        var content = Content(config, request);
        Grid.SetRow(content, 1);
        root.Children.Add(content);
        KeyboardNavigation.SetTabNavigation(root, KeyboardNavigationMode.Local);
        return root;
    }

    private static FrameworkElement Header(KioskRenderConfig config)
    {
        var border = new Border
        {
            BorderBrush = Brush(config.Theme.TextColor),
            BorderThickness = new Thickness(0, 0, 0, 2),
            Padding = new Thickness(config.Layout.SafeArea.Left, config.Layout.SafeArea.Top / 2, config.Layout.SafeArea.Right, config.Layout.SafeArea.Top / 2)
        };
        var panel = new StackPanel();
        panel.Children.Add(new TextBlock
        {
            Text = config.Screen.ToString().ToUpperInvariant(),
            FontFamily = new FontFamily("Consolas"),
            FontSize = 11 * config.FontScale,
            FontWeight = FontWeights.Bold,
            Foreground = Brush(config.Theme.TextColor)
        });
        panel.Children.Add(new TextBlock
        {
            Text = config.Theme.BrandName,
            FontSize = 24 * config.FontScale,
            FontWeight = FontWeights.Black,
            Foreground = Brush(config.Theme.TextColor)
        });
        border.Child = panel;
        return border;
    }

    private static FrameworkElement Content(KioskRenderConfig config, KioskRenderRequest request)
    {
        var panel = new Grid
        {
            Margin = new Thickness(config.Layout.SafeArea.Left, config.Layout.SafeArea.Top, config.Layout.SafeArea.Right, config.Layout.SafeArea.Bottom),
            Focusable = true
        };
        panel.ColumnDefinitions.Add(new ColumnDefinition());
        if (config.Layout.Kind is KioskLayoutKind.Split or KioskLayoutKind.Camera or KioskLayoutKind.Result)
            panel.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var state = StatePanel(config, request);
        panel.Children.Add(state);
        AddElements(panel, config);
        if (config.IsFallback)
            panel.Children.Add(new TextBlock { Text = "FALLBACK LAYOUT", Margin = new Thickness(0, 8, 0, 0), FontFamily = new FontFamily("Consolas"), FontSize = 11, Foreground = Brush(config.Theme.TextColor) });
        if (panel.ColumnDefinitions.Count > 1)
        {
            Grid.SetColumn(state, 0);
            var detail = new Border
            {
                Margin = new Thickness(16, 0, 0, 0),
                BorderBrush = Brush(config.Theme.TextColor),
                BorderThickness = new Thickness(2),
                Padding = new Thickness(16),
                Child = new TextBlock
                {
                    Text = request.IsPreview ? "PRATINJAU STUDIO" : "RUNTIME KIOSK",
                    Foreground = Brush(config.Theme.TextColor),
                    FontFamily = new FontFamily("Consolas"),
                    FontSize = 12 * config.FontScale,
                    VerticalAlignment = VerticalAlignment.Center,
                    HorizontalAlignment = HorizontalAlignment.Center
                }
            };
            Grid.SetColumn(detail, 1);
            panel.Children.Add(detail);
        }
        return panel;
    }

    private static FrameworkElement StatePanel(KioskRenderConfig config, KioskRenderRequest request)
    {
        var message = request.Message ?? request.State switch
        {
            KioskScreenState.Loading => "Memuat layar...",
            KioskScreenState.Empty => "Belum ada data untuk ditampilkan.",
            KioskScreenState.Error => "Layar mengalami kendala. Coba lagi atau hubungi petugas.",
            KioskScreenState.Offline => "Hasil lokal aman. Sinkronisasi menunggu koneksi.",
            KioskScreenState.Maintenance => "Booth sedang disiapkan. Coba lagi setelah petugas selesai.",
            KioskScreenState.Fallback => "Tampilan cadangan aktif.",
            _ => config.Screen switch
            {
                KioskScreenId.Capture => "Kamera siap digunakan.",
                KioskScreenId.Review => "Periksa foto sebelum melanjutkan.",
                KioskScreenId.Printing => "Permintaan cetak sedang diproses.",
                KioskScreenId.Offline => "Hasil lokal aman. Sinkronisasi menunggu koneksi.",
                _ => config.Screen.ToString()
            }
        };
        var border = new Border
        {
            BorderBrush = Brush(config.Theme.TextColor),
            BorderThickness = new Thickness(2),
            Padding = new Thickness(20),
            Background = Brush(config.Theme.BackgroundColor),
            Focusable = true
        };
        var panel = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        panel.Children.Add(new TextBlock
        {
            Text = request.State.ToString().ToUpperInvariant(),
            FontFamily = new FontFamily("Consolas"),
            FontWeight = FontWeights.Bold,
            FontSize = 11 * config.FontScale,
            Foreground = Brush(config.Theme.TextColor)
        });
        panel.Children.Add(new TextBlock
        {
            Text = message,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 10, 0, 0),
            FontSize = 22 * config.FontScale,
            Foreground = Brush(config.Theme.TextColor)
        });
        border.Child = panel;
        return border;
    }

    private static void AddElements(Grid panel, KioskRenderConfig config)
    {
        foreach (var element in config.Elements.Where(item => item.IsVisible).OrderBy(item => item.ZIndex))
        {
            var text = element.Kind switch
            {
                ElementKind.QrCode => "QR HASIL",
                ElementKind.Frame => "FRAME",
                ElementKind.Image => element.AssetKey ?? "GAMBAR",
                _ => element.Text ?? element.Purpose ?? element.Kind.ToString()
            };
            var block = new Border
            {
                Width = element.Width,
                Height = element.Height,
                Padding = new Thickness(8),
                BorderBrush = Brush(config.Theme.TextColor),
                BorderThickness = new Thickness(2),
                Background = Brush(config.Theme.BackgroundColor),
                Child = new TextBlock
                {
                    Text = text,
                    TextWrapping = TextWrapping.Wrap,
                    Foreground = Brush(config.Theme.TextColor),
                    FontSize = Math.Max(10, 14 * config.FontScale),
                    FontWeight = FontWeights.Bold
                }
            };
            Canvas.SetLeft(block, element.X);
            Canvas.SetTop(block, element.Y);
            var canvas = panel.Children.OfType<Canvas>().FirstOrDefault();
            if (canvas is null)
            {
                canvas = new Canvas { IsHitTestVisible = false };
                panel.Children.Add(canvas);
            }
            canvas.Children.Add(block);
        }
    }

    private static SolidColorBrush Brush(string hex)
    {
        try
        {
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        }
        catch (FormatException)
        {
            return new SolidColorBrush(Colors.Black);
        }
        catch (InvalidCastException)
        {
            return new SolidColorBrush(Colors.Black);
        }
    }
}
