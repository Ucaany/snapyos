namespace SnapyOS.Wpf.Services;

public enum UnsavedChoice
{
    Save,
    Discard,
    Cancel
}

public interface IUnsavedChanges
{
    bool HasUnsavedChanges { get; }
    Task<bool> SaveAsync();
    void DiscardChanges();
}
