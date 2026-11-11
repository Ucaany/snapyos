using SnapyOS.Wpf.Mvvm;
using SnapyOS.Wpf.Services;

namespace SnapyOS.Wpf.ViewModels;

public enum PageLoadState
{
    Loading,
    Empty,
    Ready,
    Error
}

public class ControlCenterPageViewModel : ObservableObject, IUnsavedChanges
{
    private PageLoadState _state;
    private string _stateMessage;
    private bool _hasUnsavedChanges;

    public ControlCenterPageViewModel(
        string label,
        string eyebrow,
        string description,
        bool requiresAdmin,
        bool isPlaceholder,
        bool isEditor = false)
    {
        Label = label;
        Eyebrow = eyebrow;
        Description = description;
        RequiresAdmin = requiresAdmin;
        IsPlaceholder = isPlaceholder;
        IsEditor = isEditor;
        _state = isPlaceholder ? PageLoadState.Ready : PageLoadState.Empty;
        _stateMessage = isPlaceholder ? "Struktur route sudah tersedia." : "Belum ada data lokal untuk ditampilkan.";
    }

    public string Label { get; }
    public string Eyebrow { get; }
    public string Description { get; }
    public bool RequiresAdmin { get; }
    public bool IsPlaceholder { get; }
    public bool IsEditor { get; }
    public bool HasUnsavedChanges
    {
        get => _hasUnsavedChanges;
        set => SetProperty(ref _hasUnsavedChanges, value);
    }

    public PageLoadState State
    {
        get => _state;
        private set
        {
            if (!SetProperty(ref _state, value)) return;
            OnPropertyChanged(nameof(IsLoading));
            OnPropertyChanged(nameof(IsEmpty));
            OnPropertyChanged(nameof(IsReady));
            OnPropertyChanged(nameof(IsError));
        }
    }

    public string StateMessage
    {
        get => _stateMessage;
        private set => SetProperty(ref _stateMessage, value);
    }

    public bool IsLoading => State == PageLoadState.Loading;
    public bool IsEmpty => State == PageLoadState.Empty;
    public bool IsReady => State == PageLoadState.Ready;
    public bool IsError => State == PageLoadState.Error;

    public void ShowLoading() => (State, StateMessage) = (PageLoadState.Loading, "Memeriksa data lokal...");
    public void ShowEmpty(string message = "Belum ada data lokal untuk ditampilkan.") => (State, StateMessage) = (PageLoadState.Empty, message);
    public void ShowReady(string message = "Data siap digunakan.") => (State, StateMessage) = (PageLoadState.Ready, message);
    public Task<bool> SaveAsync()
    {
        HasUnsavedChanges = false;
        return Task.FromResult(true);
    }

    public void DiscardChanges() => HasUnsavedChanges = false;

    public Task<bool> SaveChangesAsync() => SaveAsync();

    public void ShowError(string message) => (State, StateMessage) = (PageLoadState.Error, message);

}
