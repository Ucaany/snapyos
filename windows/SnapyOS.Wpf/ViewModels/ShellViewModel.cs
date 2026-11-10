using System.Collections.ObjectModel;
using SnapyOS.Wpf.Editor;
using SnapyOS.Wpf.Mvvm;
using SnapyOS.Wpf.Platform;
using SnapyOS.Wpf.Routes;
using SnapyOS.Wpf.Security;
using SnapyOS.Wpf.Services;

namespace SnapyOS.Wpf.ViewModels;

public sealed class ShellViewModel : ObservableObject
{
    private readonly RouteRegistry _registry;
    private readonly IAdminPinGuard _pinGuard;
    private readonly IConnectionStatus _connectionStatus;
    private readonly IKioskStatusService? _kioskStatus;
    private ControlCenterPageViewModel _currentPage;
    private string _currentRouteKey = "overview";
    private string _connectionLabel = "BELUM DIPASANGKAN";
    private string _connectionDetail = string.Empty;
    private string _statusLabel = "SIAP";
    private string _pinMessage = string.Empty;
    private bool _pinPromptVisible;
    private bool _unsavedPromptVisible;
    private string _pendingRouteKey = string.Empty;
    private string _pendingRouteLabel = string.Empty;

    public ShellViewModel(RouteRegistry registry, IAdminPinGuard pinGuard, IConnectionStatus? connectionStatus = null, IKioskStatusService? kioskStatus = null)
    {
        _registry = registry;
        _pinGuard = pinGuard;
        _connectionStatus = connectionStatus ?? new StaticConnectionStatus();
        _kioskStatus = kioskStatus;
        _currentPage = registry.Get("overview").CreatePage();
        Navigation = new ObservableCollection<NavigationItemViewModel>(registry.Routes.Select(route =>
            new NavigationItemViewModel(route.Key, route.Label, route.RequiresAdmin, new RelayCommand(() => RequestNavigation(route.Key)))));
        ConfirmPinCommand = new RelayCommand(ConfirmPin, () => PinPromptVisible);
        CancelPinCommand = new RelayCommand(CancelPin, () => PinPromptVisible);
        SaveChangesCommand = new RelayCommand(SaveUnsavedChanges, () => UnsavedPromptVisible);
        KeepEditingCommand = new RelayCommand(CancelUnsavedNavigation, () => UnsavedPromptVisible);
        DiscardChangesCommand = new RelayCommand(DiscardUnsavedChanges, () => UnsavedPromptVisible);
        RefreshConnectionCommand = new RelayCommand(RefreshConnectionStatus);
        RefreshConnectionStatus();
    }

    public event Action? PinClearRequested;
    public ObservableCollection<NavigationItemViewModel> Navigation { get; }

    public ControlCenterPageViewModel CurrentPage
    {
        get => _currentPage;
        private set => SetProperty(ref _currentPage, value);
    }

    public string ConnectionLabel
    {
        get => _connectionLabel;
        private set => SetProperty(ref _connectionLabel, value);
    }

    public string ConnectionDetail
    {
        get => _connectionDetail;
        private set => SetProperty(ref _connectionDetail, value);
    }

    public string StatusLabel
    {
        get => _statusLabel;
        private set => SetProperty(ref _statusLabel, value);
    }

    public string LockdownLabel => _kioskStatus?.Read().Label ?? "STATUS LOCKDOWN BELUM TERSEDIA";
    public string LockdownDetail => _kioskStatus?.Read().Detail ?? "Capability Windows belum dibaca.";

    public string PinMessage
    {
        get => _pinMessage;
        private set => SetProperty(ref _pinMessage, value);
    }

    public bool PinPromptVisible
    {
        get => _pinPromptVisible;
        private set
        {
            if (!SetProperty(ref _pinPromptVisible, value)) return;
            ConfirmPinCommand.NotifyCanExecuteChanged();
            CancelPinCommand.NotifyCanExecuteChanged();
        }
    }

    public bool UnsavedPromptVisible
    {
        get => _unsavedPromptVisible;
        private set
        {
            if (!SetProperty(ref _unsavedPromptVisible, value)) return;
            SaveChangesCommand.NotifyCanExecuteChanged();
            KeepEditingCommand.NotifyCanExecuteChanged();
            DiscardChangesCommand.NotifyCanExecuteChanged();
        }
    }

    public string PendingRouteLabel
    {
        get => _pendingRouteLabel;
        private set => SetProperty(ref _pendingRouteLabel, value);
    }

    public string AdminPin { get; set; } = string.Empty;
    public RelayCommand ConfirmPinCommand { get; }
    public RelayCommand CancelPinCommand { get; }
    public RelayCommand SaveChangesCommand { get; }
    public RelayCommand KeepEditingCommand { get; }
    public RelayCommand DiscardChangesCommand { get; }
    public RelayCommand RefreshConnectionCommand { get; }
    public bool HasUnsavedChanges => CurrentPage.HasUnsavedChanges;

    public void SetLoading() => CurrentPage.ShowLoading();
    public void SetEmpty() => CurrentPage.ShowEmpty();
    public void SetError(string message) => CurrentPage.ShowError(message);

    public bool ConfirmClose(UnsavedChoice choice)
    {
        if (!CurrentPage.HasUnsavedChanges) return true;
        return choice switch
        {
            UnsavedChoice.Save => SaveCurrentPage(),
            UnsavedChoice.Discard => DiscardCurrentPage(),
            _ => false
        };
    }

    public void RefreshConnectionStatus()
    {
        var snapshot = _connectionStatus.Read();
        ConnectionLabel = snapshot.Label;
        ConnectionDetail = snapshot.Detail;
        if (snapshot.State == ConnectionState.Error) StatusLabel = "PERLU PERBAIKAN";
        OnPropertyChanged(nameof(LockdownLabel));
        OnPropertyChanged(nameof(LockdownDetail));
    }

    private void RequestNavigation(string key)
    {
        var route = _registry.Get(key);
        if (route.Key == _currentRouteKey) return;
        _pendingRouteKey = key;
        PendingRouteLabel = route.Label;
        if (CurrentPage.HasUnsavedChanges)
        {
            UnsavedPromptVisible = true;
            return;
        }
        ContinuePendingNavigation();
    }

    private void ContinuePendingNavigation()
    {
        var route = _registry.Get(_pendingRouteKey);
        if (route.RequiresAdmin)
        {
            PinMessage = _pinGuard.IsConfigured ? "Masukkan PIN admin untuk melanjutkan." : "PIN admin belum dikonfigurasi.";
            PinPromptVisible = true;
            return;
        }
        Navigate(route);
    }

    private void ConfirmPin()
    {
        var result = _pinGuard.Verify(AdminPin, out var retryAfter);
        PinClearRequested?.Invoke();
        AdminPin = string.Empty;
        if (result != AdminPinResult.Success)
        {
            PinMessage = result switch
            {
                AdminPinResult.NotConfigured => "PIN admin belum dikonfigurasi.",
                AdminPinResult.LockedOut => $"PIN terkunci. Coba lagi dalam {retryAfter?.Minutes ?? 0} menit.",
                _ => "PIN admin tidak valid."
            };
            return;
        }
        PinPromptVisible = false;
        ContinuePendingNavigation();
    }

    private void CancelPin()
    {
        PinClearRequested?.Invoke();
        AdminPin = string.Empty;
        PinPromptVisible = false;
        _pendingRouteKey = string.Empty;
    }

    private void SaveUnsavedChanges()
    {
        if (!SaveCurrentPage()) return;
        UnsavedPromptVisible = false;
        ContinuePendingNavigation();
    }

    private bool SaveCurrentPage()
    {
        try
        {
            var saved = CurrentPage.SaveAsync().GetAwaiter().GetResult();
            if (!saved) CurrentPage.ShowError("Perubahan tidak berhasil disimpan.");
            return saved;
        }
        catch (Exception ex)
        {
            CurrentPage.ShowError($"Gagal menyimpan perubahan: {ex.Message}");
            return false;
        }
    }

    private void CancelUnsavedNavigation()
    {
        UnsavedPromptVisible = false;
        _pendingRouteKey = string.Empty;
    }

    private void DiscardUnsavedChanges()
    {
        if (!DiscardCurrentPage()) return;
        UnsavedPromptVisible = false;
        ContinuePendingNavigation();
    }

    private bool DiscardCurrentPage()
    {
        CurrentPage.DiscardChanges();
        return true;
    }

    private void Navigate(RouteDescriptor route)
    {
        CurrentPage = route.CreatePage();
        _currentRouteKey = route.Key;
        StatusLabel = route.IsPlaceholder ? "PLACEHOLDER" : "SIAP";
        _pendingRouteKey = string.Empty;
        UnsavedPromptVisible = false;
        OnPropertyChanged(nameof(HasUnsavedChanges));
    }

    private sealed class StaticConnectionStatus : IConnectionStatus
    {
        public ConnectionSnapshot Read() => new(ConnectionState.SetupRequired, "BELUM DIPASANGKAN", "Status pairing belum tersedia.", null);
    }
}
