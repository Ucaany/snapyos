using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Input;
using SnapyOS.Agent;
using SnapyOS.Contracts;
using SnapyOS.Core;
using SnapyOS.LocalStore;
using SnapyOS.Wpf.Mvvm;

namespace SnapyOS.Wpf.Kiosk;

public enum CustomerKioskStage
{
    Welcome,
    Guide,
    Package,
    Payment,
    Template,
    Capture,
    Review,
    Editor,
    Printing,
    Result,
    Offline,
    Error,
    Maintenance
}

public sealed record KioskTemplateSelection(string Id, PhotoStripTemplate PhotoStrip, bool CreateGif, bool Print);

public static class CustomerKioskStageMap
{
    public static KioskScreenId ToScreen(CustomerKioskStage stage) => stage switch
    {
        CustomerKioskStage.Welcome => KioskScreenId.Welcome,
        CustomerKioskStage.Guide => KioskScreenId.Guide,
        CustomerKioskStage.Package => KioskScreenId.Package,
        CustomerKioskStage.Payment => KioskScreenId.Payment,
        CustomerKioskStage.Template => KioskScreenId.Template,
        CustomerKioskStage.Capture => KioskScreenId.Capture,
        CustomerKioskStage.Review => KioskScreenId.Review,
        CustomerKioskStage.Editor => KioskScreenId.Editor,
        CustomerKioskStage.Printing => KioskScreenId.Printing,
        CustomerKioskStage.Result => KioskScreenId.Result,
        CustomerKioskStage.Offline => KioskScreenId.Offline,
        CustomerKioskStage.Maintenance => KioskScreenId.Maintenance,
        CustomerKioskStage.Error => KioskScreenId.Error,
        _ => throw new ArgumentOutOfRangeException(nameof(stage))
    };
}

public interface IResultPublisher
{
    Task<CloudResultAck?> PublishAsync(ResultManifest manifest, CancellationToken cancellationToken = default);
}

public sealed class OfflineResultPublisher : IResultPublisher
{
    public Task<CloudResultAck?> PublishAsync(ResultManifest manifest, CancellationToken cancellationToken = default) =>
        Task.FromResult<CloudResultAck?>(null);
}

public sealed class KioskFlowViewModel : ObservableObject, IAsyncDisposable
{
    private readonly LocalSessionRepository _sessions;
    private readonly SnapyOS.LocalStore.LocalStore _store;
    private readonly CloudPaymentClient _payments;
    private readonly PairingClient _pairing;
    private readonly IDeviceTokenStore _deviceTokens;
    private readonly LocalMediaPipeline _media;
    private readonly LocalGifRenderer _gif;
    private readonly ResultManifestRepository _manifests;
    private readonly LocalOutputSyncQueue _syncQueue;
    private readonly IUvcCamera _camera;
    private readonly WindowsPrintSpoolerAdapter _printer;
    private readonly KioskRuntimeHost _runtime;
    private readonly CancellationTokenSource _lifetime = new();
    private CancellationTokenSource? _sessionLifetime;
    private bool _timerStarted;
    private SessionPolicy _policy = new();
    private KioskTemplateSelection? _template;
    private PaymentView? _payment;
    private SessionRecord? _session;
    private ResultManifest? _manifest;
    private CustomerKioskStage _stage = CustomerKioskStage.Welcome;
    private string _message = "Siap mengambil foto.";
    private int _secondsRemaining;

    public KioskFlowViewModel(
        LocalSessionRepository sessions,
        SnapyOS.LocalStore.LocalStore store,
        CloudPaymentClient payments,
        PairingClient pairing,
        IDeviceTokenStore deviceTokens,
        LocalMediaPipeline media,
        LocalGifRenderer gif,
        ResultManifestRepository manifests,
        LocalOutputSyncQueue syncQueue,
        IUvcCamera camera,
        WindowsPrintSpoolerAdapter printer,
        KioskRuntimeHost runtime)
    {
        _sessions = sessions;
        _store = store;
        _payments = payments;
        _pairing = pairing;
        _deviceTokens = deviceTokens;
        _media = media;
        _gif = gif;
        _manifests = manifests;
        _syncQueue = syncQueue;
        _camera = camera;
        _printer = printer;
        _runtime = runtime;
        Packages = [];
        Templates =
        [
            new KioskTemplateSelection(
                "default",
                new PhotoStripTemplate(1200, 1800, "#FFFDF5", [
                    new TemplateSlot(80, 80, 1040, 760),
                    new TemplateSlot(80, 880, 1040, 760)
                ], []),
                CreateGif: true,
                Print: true)
        ];
        StartCommand = new RelayCommand(() => _ = BeginAsync());
        ContinueCommand = new RelayCommand(() => _ = ContinueAsync());
        CaptureCommand = new RelayCommand(() => _ = CaptureAsync());
        FinalizeCommand = new RelayCommand(() => _ = FinalizeAsync());
        RetryCommand = new RelayCommand(() => _ = RetryAsync());
        ResetCommand = new RelayCommand(Reset);
        Render();
    }

    public ObservableCollection<PackageSummary> Packages { get; }
    public IReadOnlyList<KioskTemplateSelection> Templates { get; }
    public ICommand StartCommand { get; }
    public ICommand ContinueCommand { get; }
    public ICommand CaptureCommand { get; }
    public ICommand FinalizeCommand { get; }
    public ICommand RetryCommand { get; }
    public ICommand ResetCommand { get; }
    public CustomerKioskStage Stage { get => _stage; private set { if (SetProperty(ref _stage, value)) Render(); } }
    public KioskScreenId Screen => CustomerKioskStageMap.ToScreen(Stage);
    public string Message { get => _message; private set => SetProperty(ref _message, value); }
    public int SecondsRemaining { get => _secondsRemaining; private set => SetProperty(ref _secondsRemaining, value); }
    public PaymentView? Payment => _payment;
    public ResultManifest? Manifest => _manifest;
    public bool HasPayment => _payment is not null;
    public bool HasResult => _manifest is not null;

    public async Task BeginAsync(CancellationToken cancellationToken = default)
    {
        ResetTimer();
        Stage = CustomerKioskStage.Guide;
        Message = "Ikuti petunjuk di layar, lalu pilih paket.";
        await Task.CompletedTask;
    }

    public async Task ContinueAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            switch (Stage)
            {
                case CustomerKioskStage.Guide:
                    await LoadPackagesAsync(cancellationToken);
                    break;
                case CustomerKioskStage.Package:
                    if (Packages.Count == 0) throw new InvalidOperationException("Paket belum tersedia.");
                    await SelectPackageAsync(Packages[0], cancellationToken);
                    break;
                case CustomerKioskStage.Payment:
                    await CreateOnlinePaymentAsync(cancellationToken);
                    break;
                case CustomerKioskStage.Template:
                    SelectTemplate(Templates[0]);
                    break;
                case CustomerKioskStage.Review:
                    await FinalizeAsync(cancellationToken);
                    break;
                case CustomerKioskStage.Result:
                case CustomerKioskStage.Offline:
                case CustomerKioskStage.Error:
                    Reset();
                    break;
            }
        }
        catch (Exception exception)
        {
            ShowCustomerError(exception);
        }
    }

    public async Task LoadPackagesAsync(CancellationToken cancellationToken = default)
    {
        var profile = _pairing.Snapshot.Profile ?? throw new InvalidOperationException("Booth belum siap.");
        var token = _deviceTokens.Read() ?? throw new InvalidOperationException("Pembayaran belum tersedia.");
        var packages = await _payments.FetchPackagesAsync(profile.BusinessSlug, profile.PhotoboxSlug, cancellationToken);
        Packages.Clear();
        foreach (var package in packages) Packages.Add(package);
        Stage = packages.Count == 0 ? CustomerKioskStage.Maintenance : CustomerKioskStage.Package;
        Message = packages.Count == 0 ? "Paket belum tersedia. Silakan coba lagi." : "Pilih paket foto.";
        _ = token;
    }

    public async Task SelectPackageAsync(PackageSummary package, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(package);
        var profile = _pairing.Snapshot.Profile ?? throw new InvalidOperationException("Booth belum siap.");
        var token = _deviceTokens.Read() ?? throw new InvalidOperationException("Pembayaran belum tersedia.");
        var now = DateTimeOffset.UtcNow;
        var sessionId = $"local_{Guid.NewGuid():N}";
        _policy = new SessionPolicy { TimerSeconds = 300, WarningSeconds = 60, AutoFinalizeOnTimeout = true, AllowOfflineCash = true };
        _session = _sessions.Start(sessionId, profile.BusinessSlug, profile.PhotoboxSlug, package.Id, $"session:{sessionId}", now, now.AddSeconds(_policy.TimerSeconds));
        Stage = CustomerKioskStage.Payment;
        Message = $"Paket {package.Name}. Pilih pembayaran QRIS.";
        _ = token;
        await Task.CompletedTask;
    }

    public async Task CreateOnlinePaymentAsync(CancellationToken cancellationToken = default)
    {
        EnsureSession();
        var profile = _pairing.Snapshot.Profile ?? throw new InvalidOperationException("Booth belum siap.");
        var token = _deviceTokens.Read() ?? throw new InvalidOperationException("Pembayaran belum tersedia.");
        var checkout = await _payments.CreateCheckoutAsync(profile.BusinessSlug, _session!.PackageId, token, cancellationToken: cancellationToken);
        var method = checkout.PaymentMethods.FirstOrDefault()?["id"]?.GetValue<string>() ?? "qris";
        _payment = await _payments.CreatePaymentAsync(profile.BusinessSlug, checkout.CheckoutSessionId, method, token, $"payment:{_session.SessionId}", cancellationToken);
        if (_payment.State == PaymentClientState.Failed || _payment.State == PaymentClientState.Expired) throw new InvalidOperationException("Pembayaran tidak berhasil.");
        if (_payment.State != PaymentClientState.Paid)
        {
            Message = "Selesaikan pembayaran QRIS pada ponsel Anda.";
            OnPropertyChanged(nameof(Payment));
            return;
        }
        UnlockAfterPayment();
    }

    public async Task PollPaymentAsync(CancellationToken cancellationToken = default)
    {
        EnsureSession();
        if (_payment is null) throw new InvalidOperationException("Pembayaran belum dibuat.");
        var profile = _pairing.Snapshot.Profile ?? throw new InvalidOperationException("Booth belum siap.");
        var token = _deviceTokens.Read() ?? throw new InvalidOperationException("Pembayaran belum tersedia.");
        _payment = await _payments.PollStatusAsync(profile.BusinessSlug, _payment.PaymentReference, token, cancellationToken);
        OnPropertyChanged(nameof(Payment));
        if (_payment.State == PaymentClientState.Paid) UnlockAfterPayment();
        else if (_payment.State is PaymentClientState.Expired or PaymentClientState.Failed) throw new InvalidOperationException("Pembayaran tidak berhasil.");
    }

    public void RequestCashPayment()
    {
        EnsureSession();
        if (!_policy.AllowOfflineCash) throw new InvalidOperationException("Tunai offline tidak tersedia.");
        Message = "Silakan panggil petugas untuk menyelesaikan pembayaran tunai.";
        OnPropertyChanged(nameof(Payment));
    }

    public void SelectTemplate(KioskTemplateSelection template)
    {
        ArgumentNullException.ThrowIfNull(template);
        EnsureSession();
        _template = template;
        Transition(LocalSessionState.Capture, LocalSessionTransitionReason.Paid, "capture:start");
        Stage = CustomerKioskStage.Capture;
        Message = "Kamera siap. Ambil foto pertama.";
    }

    public async Task CaptureAsync(CancellationToken cancellationToken = default)
    {
        EnsureSession();
        if (Stage != CustomerKioskStage.Capture) return;
        var frame = await _camera.CaptureStillAsync(cancellationToken);
        var directory = Path.Combine(_store.MediaRoot, _session!.SessionId);
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"capture_{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}.jpg");
        await File.WriteAllBytesAsync(path, frame.Payload.ToArray(), cancellationToken);
        _store.RegisterMedia($"media_{Guid.NewGuid():N}", _session.SessionId, Path.GetRelativePath(_store.MediaRoot, path), "photo", DateTimeOffset.UtcNow.AddDays(3));
        Transition(LocalSessionState.Review, LocalSessionTransitionReason.Captured, "capture:review");
        Stage = CustomerKioskStage.Review;
        Message = "Periksa foto, lalu lanjutkan.";
    }

    public async Task FinalizeAsync(CancellationToken cancellationToken = default)
    {
        EnsureSession();
        if (_template is null) throw new InvalidOperationException("Template belum dipilih.");
        if (_session is { State: not "Finalize" and not "finalized" })
            Transition(LocalSessionState.Finalize, LocalSessionTransitionReason.Finalized, "finalize:render");
        var photos = Directory.EnumerateFiles(Path.Combine(_store.MediaRoot, _session!.SessionId), "*.jpg").OrderBy(path => path).Select(path => new PhotoInput(path)).ToArray();
        if (photos.Length == 0) throw new InvalidOperationException("Foto belum tersedia.");
        var stripPath = Path.Combine(_store.MediaRoot, _session.SessionId, "photo-strip.jpg");
        var strip = _media.RenderPhotoStrip(photos, _template.PhotoStrip, stripPath, MediaOutputFormat.Jpeg);
        LocalGifOutput? gif = null;
        if (_template.CreateGif && photos.Length > 1)
            gif = await _gif.RenderAsync(photos.Select(photo => new GifFrameInput(photo.Path, TimeSpan.FromMilliseconds(800))).ToArray(), Path.Combine(_store.MediaRoot, _session.SessionId, "result.gif"), cancellationToken: cancellationToken);
        var retention = DateTimeOffset.UtcNow.AddDays(3);
        _manifest = ResultManifestFactory.Create(_session.SessionId, _payment?.PaymentReference ?? _session.IdempotencyKey ?? throw new InvalidOperationException("Transaction reference is missing."), strip, gif, retention);
        _manifests.Save(_manifest);
        _store.RegisterMedia($"media_{Guid.NewGuid():N}", _session.SessionId, Path.GetRelativePath(_store.MediaRoot, strip.Path), "photo_strip", retention);
        if (gif is not null) _store.RegisterMedia($"media_{Guid.NewGuid():N}", _session.SessionId, Path.GetRelativePath(_store.MediaRoot, gif.Path), "gif", retention);
        Transition(LocalSessionState.Print, LocalSessionTransitionReason.Finalized, "print:start");
        Stage = CustomerKioskStage.Printing;
        Message = "Hasil sedang diproses.";
        if (_template.Print)
        {
            try { await PrintAsync(strip, cancellationToken); }
            catch (Exception exception)
            {
                Message = "Hasil digital tetap tersimpan. Petugas dapat mencoba mencetak ulang.";
                _ = exception;
            }
        }
        Transition(LocalSessionState.OutputManifest, LocalSessionTransitionReason.PrintSubmitted, "manifest:ready");
        Transition(LocalSessionState.PendingSync, LocalSessionTransitionReason.ManifestWritten, "sync:queue");
        _syncQueue.Enqueue(_session.SessionId, _session.IdempotencyKey ?? $"session:{_session.SessionId}", DateTimeOffset.UtcNow);
        Stage = CustomerKioskStage.Offline;
        Message = "Hasil tersimpan di booth. QR tersedia setelah koneksi pulih.";
        OnPropertyChanged(nameof(Manifest));
    }

    private async Task PrintAsync(MediaOutput output, CancellationToken cancellationToken)
    {
        var printers = await _printer.EnumerateAsync(cancellationToken);
        var printer = printers.FirstOrDefault(item => item.Availability == PrinterAvailability.Online) ?? throw new InvalidOperationException("Printer belum siap.");
        var document = await File.ReadAllBytesAsync(output.Path, cancellationToken);
        await _printer.SubmitAsync(new PrintRequest(printer.StableId, document, "image/jpeg", printer.PaperProfiles.FirstOrDefault() ?? new PaperProfile("default", 101.6, 152.4, false), PrintOrientation.Portrait, 1, $"print:{_session!.SessionId}"), cancellationToken);
    }

    private void UnlockAfterPayment()
    {
        EnsureSession();
        if (_session is { State: "active" })
        {
            _store.UpdateSessionExpiry(_session.SessionId, DateTimeOffset.UtcNow.AddSeconds(_policy.TimerSeconds));
            Transition(LocalSessionState.PaidUnlock, LocalSessionTransitionReason.Paid, "payment:paid");
        }
        StartTimer();
        Stage = CustomerKioskStage.Template;
        Message = "Pilih bingkai foto.";
        OnPropertyChanged(nameof(Payment));
    }

    private void Transition(LocalSessionState state, LocalSessionTransitionReason reason, string operationKey)
    {
        _sessions.Transition(_session!.SessionId, state, DateTimeOffset.UtcNow, reason, operationKey);
        _session = _sessions.Read(_session.SessionId);
    }

    private void StartTimer()
    {
        if (_timerStarted) return;
        _timerStarted = true;
        _sessionLifetime = new CancellationTokenSource();
        _ = TimerLoopAsync(_sessionLifetime.Token);
    }

    private async Task TimerLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested && _session?.ExpiresAt is { } expires)
        {
            SecondsRemaining = Math.Max(0, (int)Math.Ceiling((expires - DateTimeOffset.UtcNow).TotalSeconds));
            if (SecondsRemaining == 0)
            {
                try
                {
                    var transition = _sessions.Timeout(_session.SessionId, DateTimeOffset.UtcNow, new(_policy.AutoFinalizeOnTimeout), "timeout:session");
                    _session = _sessions.Read(_session.SessionId);
                    if (transition.To == LocalSessionState.Finalize && Stage is (CustomerKioskStage.Capture or CustomerKioskStage.Review or CustomerKioskStage.Editor))
                        await FinalizeAsync(cancellationToken);
                    else
                    {
                        Stage = CustomerKioskStage.Error;
                        Message = "Waktu sesi habis. Silakan mulai lagi.";
                    }
                }
                catch (Exception exception) { ShowCustomerError(exception); }
                return;
            }
            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
        }
    }

    private async Task RetryAsync()
    {
        if (Stage == CustomerKioskStage.Payment && _payment is not null) await PollPaymentAsync();
        else if (Stage is CustomerKioskStage.Error or CustomerKioskStage.Offline) Reset();
    }

    private void Reset()
    {
        ResetTimer();
        _session = null;
        _payment = null;
        _manifest = null;
        _template = null;
        Packages.Clear();
        SecondsRemaining = 0;
        Stage = CustomerKioskStage.Welcome;
        Message = "Siap mengambil foto.";
        OnPropertyChanged(nameof(Payment));
        OnPropertyChanged(nameof(Manifest));
    }

    private void ResetTimer()
    {
        _sessionLifetime?.Cancel();
        _sessionLifetime?.Dispose();
        _sessionLifetime = null;
        _timerStarted = false;
    }

    private void EnsureSession() => _ = _session ?? throw new InvalidOperationException("Sesi belum dimulai.");

    private void ShowCustomerError(Exception exception)
    {
        Stage = exception is NotSupportedException or FileNotFoundException ? CustomerKioskStage.Maintenance : CustomerKioskStage.Error;
        Message = Stage == CustomerKioskStage.Maintenance ? "Booth sedang disiapkan. Silakan hubungi petugas." : "Ada kendala. Silakan coba lagi.";
    }

    private void Render()
    {
        var theme = new BrandTheme { BrandName = "SNAPYOS", BackgroundColor = "#FFFDF5", TextColor = "#111111" };
        var state = Stage switch
        {
            CustomerKioskStage.Error => KioskScreenState.Error,
            CustomerKioskStage.Offline => KioskScreenState.Offline,
            CustomerKioskStage.Maintenance => KioskScreenState.Maintenance,
            _ => KioskScreenState.Ready
        };
        _runtime.Show(Screen, KioskOrientation.Landscape, theme, state, Message);
        OnPropertyChanged(nameof(Screen));
        OnPropertyChanged(nameof(HasPayment));
        OnPropertyChanged(nameof(HasResult));
    }

    public async ValueTask DisposeAsync()
    {
        ResetTimer();
        _lifetime.Cancel();
        _lifetime.Dispose();
        await _camera.DisposeAsync();
    }
}
