using SnapyOS.Wpf.ViewModels;

namespace SnapyOS.Wpf.Routes;

public sealed class RouteRegistry
{
    private readonly IReadOnlyList<RouteDescriptor> _routes;
    private readonly IReadOnlyDictionary<string, RouteDescriptor> _byKey;

    public RouteRegistry()
    {
        _routes =
        [
            new("overview", "Ringkasan", "CONTROL CENTER", false, false, () => new("Ringkasan", "CONTROL CENTER", "Status operasional booth dalam satu pandangan.", false, false)),
            new("sessions", "Sesi lokal", "SESI LOKAL", false, false, () => new("Sesi lokal", "SESI LOKAL", "Antrian sesi dan hasil lokal.", false, false)),
            new("setup", "Kiosk Studio", "KIOSK STUDIO", true, false, () => new("Kiosk Studio", "KIOSK STUDIO", "Susun elemen layar kiosk dengan batas aman dan grid snap.", true, false, true)),
            new("camera", "Kamera", "PERANGKAT / KAMERA", true, true, () => new("Kamera", "PERANGKAT / KAMERA", "Segera hadir. Detail kamera belum menjadi bagian shell ini.", true, true)),
            new("printer", "Printer", "PERANGKAT / PRINTER", true, true, () => new("Printer", "PERANGKAT / PRINTER", "Segera hadir. Detail printer belum menjadi bagian shell ini.", true, true)),
            new("installer", "Pemasang", "RILIS WINDOWS", true, true, () => new("Pemasang", "RILIS WINDOWS", "Segera hadir. Katalog pemasang belum tersedia pada shell ini.", true, true))
        ];
        _byKey = _routes.ToDictionary(route => route.Key, StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyList<RouteDescriptor> Routes => _routes;

    public RouteDescriptor Get(string key) =>
        _byKey.TryGetValue(key, out var route) ? route : throw new KeyNotFoundException($"Unknown route: {key}");
}
