using System.Windows.Input;

namespace SnapyOS.Wpf.ViewModels;

public sealed class NavigationItemViewModel(string key, string label, bool requiresAdmin, ICommand command)
{
    public string Key { get; } = key;
    public string Label { get; } = label;
    public bool RequiresAdmin { get; } = requiresAdmin;
    public ICommand Command { get; } = command;
}
