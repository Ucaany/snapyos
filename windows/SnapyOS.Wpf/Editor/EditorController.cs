using System.Collections.ObjectModel;
using System.Windows;
using SnapyOS.Contracts;
using SnapyOS.Wpf.Mvvm;

namespace SnapyOS.Wpf.Editor;

public sealed class EditorCanvasController : ObservableObject
{
    private readonly EditorCanvasModel _canvas;
    private readonly EditorCommandHistory _history = new();
    private readonly ObservableCollection<string> _selectedIds = [];

    public EditorCanvasController(EditorCanvasModel? canvas = null)
    {
        _canvas = canvas ?? new EditorCanvasModel();
        SelectedIds = new ReadOnlyObservableCollection<string>(_selectedIds);
        MoveCommand = new RelayCommand(() => MoveSelected(0, _canvas.SnapGridSize));
        UndoCommand = new RelayCommand(Undo, () => _history.CanUndo);
        RedoCommand = new RelayCommand(Redo, () => _history.CanRedo);
        DeleteCommand = new RelayCommand(DeleteSelected, () => SelectedIds.Count > 0);
        DuplicateCommand = new RelayCommand(DuplicateSelected, () => SelectedIds.Count > 0);
    }

    public EditorCanvasModel Canvas => _canvas;
    public ReadOnlyObservableCollection<string> SelectedIds { get; }
    public EditorElementModel? SelectedElement => SelectedElements().FirstOrDefault();
    public RelayCommand MoveCommand { get; }
    public RelayCommand UndoCommand { get; }
    public RelayCommand RedoCommand { get; }
    public RelayCommand DeleteCommand { get; }
    public RelayCommand DuplicateCommand { get; }
    public bool CanUndo => _history.CanUndo;
    public bool CanRedo => _history.CanRedo;

    public void Select(string? elementId, bool extend = false)
    {
        if (!extend) _selectedIds.Clear();
        if (elementId is not null && _canvas.Elements.Any(e => e.ElementId == elementId) && !_selectedIds.Contains(elementId))
            _selectedIds.Add(elementId);
        OnPropertyChanged(nameof(SelectedElement));
        NotifyCommands();
    }

    public void PatchSelectedProperties(Action<EditorElementModel> patch)
    {
        ArgumentNullException.ThrowIfNull(patch);
        var selected = SelectedElements().Where(e => !e.IsLocked).ToArray();
        if (selected.Length == 0) return;
        var snapshots = selected.Select(e => (e, copy: Snapshot(e))).ToArray();
        _history.Execute(new DelegateEditorCommand(
            () => selected.ToList().ForEach(patch),
            () => snapshots.ToList().ForEach(item => Restore(item.e, item.copy))));
        NotifyCommands();
    }

    private static EditorElementSnapshot Snapshot(EditorElementModel element) => new(element.Text, element.Properties, element.Rotation, element.Shape, element.Radius);
    private static void Restore(EditorElementModel element, EditorElementSnapshot snapshot)
    {
        element.Text = snapshot.Text;
        element.Properties = snapshot.Properties;
        element.Rotation = snapshot.Rotation;
        element.Shape = snapshot.Shape;
        element.Radius = snapshot.Radius;
    }
    private sealed record EditorElementSnapshot(string? Text, EditorProperties Properties, double Rotation, string Shape, double Radius);

    public void Add(EditorElementModel element, Point? dropPoint = null)
    {
        if (_canvas.Elements.Any(e => e.ElementId == element.ElementId)) throw new InvalidOperationException("Element ID must be unique.");
        var position = dropPoint ?? new Point(element.X, element.Y);
        element.X = ClampX(element, position.X, false);
        element.Y = ClampY(element, position.Y, false);
        var index = _canvas.Elements.Count;
        _history.Execute(new DelegateEditorCommand(
            () => { element.X = ClampX(element, position.X, false); element.Y = ClampY(element, position.Y, false); _canvas.Elements.Insert(index, element); Select(element.ElementId); },
            () => { _canvas.Elements.Remove(element); Select(null); }));
        NotifyCommands();
    }

    public void MoveSelected(double deltaX, double deltaY, bool snap = true)
    {
        var selected = SelectedElements().Where(e => !e.IsLocked).ToArray();
        if (selected.Length == 0) return;
        var old = selected.Select(e => (e, value: (e.X, e.Y))).ToArray();
        var next = selected.Select(e => (e, value: (ClampX(e, e.X + deltaX, snap), ClampY(e, e.Y + deltaY, snap)))).ToArray();
        ExecuteValues(old, next, (e, value) => { e.X = value.Item1; e.Y = value.Item2; });
    }

    public void ResizeSelected(double deltaWidth, double deltaHeight, bool snap = true)
    {
        var selected = SelectedElements().Where(e => !e.IsLocked).ToArray();
        if (selected.Length == 0) return;
        var old = selected.Select(e => (e, value: (e.Width, e.Height))).ToArray();
        var next = selected.Select(e => (e, value: (Width: Snap(Math.Max(1, Math.Min(e.Width + deltaWidth, _canvas.Orientation.CanvasWidth - e.X - _canvas.SafeArea.Right)), snap), Height: Snap(Math.Max(1, Math.Min(e.Height + deltaHeight, _canvas.Orientation.CanvasHeight - e.Y - _canvas.SafeArea.Bottom)), snap)))).ToArray();
        ExecuteValues(old, next, (e, value) => { e.Width = value.Width; e.Height = value.Height; });
    }

    public void AlignSelected(HorizontalAlignment horizontal, VerticalAlignment vertical)
    {
        var selected = SelectedElements().Where(e => !e.IsLocked).ToArray();
        if (selected.Length == 0) return;
        var old = selected.Select(e => (e, value: (e.X, e.Y))).ToArray();
        var next = selected.Select(e => (e, value: (
            X: horizontal switch { HorizontalAlignment.Left => _canvas.SafeArea.Left, HorizontalAlignment.Center => (_canvas.Orientation.CanvasWidth - e.Width) / 2, _ => _canvas.Orientation.CanvasWidth - _canvas.SafeArea.Right - e.Width },
            Y: vertical switch { VerticalAlignment.Top => _canvas.SafeArea.Top, VerticalAlignment.Center => (_canvas.Orientation.CanvasHeight - e.Height) / 2, _ => _canvas.Orientation.CanvasHeight - _canvas.SafeArea.Bottom - e.Height }))).ToArray();
        ExecuteValues(old, next, (e, value) => { e.X = value.X; e.Y = value.Y; });
    }

    public void Reorder(int delta)
    {
        var selected = SelectedElements().Where(e => !e.IsLocked).ToArray();
        if (selected.Length == 0) return;
        var old = selected.Select(e => (e, e.ZIndex)).ToArray();
        var next = selected.Select(e => (e, ZIndex: e.ZIndex + delta)).ToArray();
        ExecuteValues(old, next, (e, z) => e.ZIndex = z);
    }

    public void ResizeSelectedByKeyboard(double delta)
        => ResizeSelected(delta, delta, snap: false);

    public void GroupSelected()
    {
        var selected = SelectedElements().Where(e => !e.IsLocked).ToArray();
        if (selected.Length < 2) return;
        var groupId = $"group-{selected.Select(e => e.ElementId).Min(StringComparer.Ordinal)}";
        var old = selected.Select(e => (e, GroupId: e.GroupId)).ToArray();
        _history.Execute(new DelegateEditorCommand(() => selected.ToList().ForEach(e => e.GroupId = groupId), () => old.ToList().ForEach(x => x.e.GroupId = x.GroupId)));
        NotifyCommands();
    }

    public void ToggleLock()
    {
        var selected = SelectedElements().ToArray();
        if (selected.Length == 0) return;
        var old = selected.Select(e => (e, e.IsLocked)).ToArray();
        var next = selected.Select(e => (e, IsLocked: !e.IsLocked)).ToArray();
        ExecuteValues(old, next, (e, value) => e.IsLocked = value);
    }

    public void ToggleVisibility()
    {
        var selected = SelectedElements().ToArray();
        if (selected.Length == 0) return;
        var old = selected.Select(e => (e, e.IsVisible)).ToArray();
        var next = selected.Select(e => (e, IsVisible: !e.IsVisible)).ToArray();
        ExecuteValues(old, next, (e, value) => e.IsVisible = value);
    }

    public void DuplicateSelected()
    {
        foreach (var source in SelectedElements().ToArray())
        {
            var id = NextId(source.ElementId);
            var copy = new EditorElementModel(id, source.Kind, source.Purpose) { X = source.X + _canvas.SnapGridSize, Y = source.Y + _canvas.SnapGridSize, Width = source.Width, Height = source.Height, ZIndex = source.ZIndex + 1, AssetReference = source.AssetReference, Text = source.Text, OrientationProfile = source.OrientationProfile };
            foreach (var pair in source.Style) copy.Style[pair.Key] = pair.Value;
            foreach (var pair in source.Bindings) copy.Bindings[pair.Key] = pair.Value;
            Add(copy);
        }
    }

    public void DeleteSelected()
    {
        var selected = SelectedElements().Where(e => !e.IsLocked).ToArray();
        if (selected.Length == 0) return;
        var indices = selected.ToDictionary(e => e, e => _canvas.Elements.IndexOf(e));
        _history.Execute(new DelegateEditorCommand(() => selected.ToList().ForEach(e => _canvas.Elements.Remove(e)), () => selected.OrderBy(e => indices[e]).ToList().ForEach(e => _canvas.Elements.Insert(indices[e], e))));
        Select(null);
        NotifyCommands();
    }

    public void Undo() { _history.Undo(); NotifyCommands(); }
    public void Redo() { _history.Redo(); NotifyCommands(); }

    private IEnumerable<EditorElementModel> SelectedElements() => _canvas.Elements.Where(e => _selectedIds.Contains(e.ElementId));
    private void ExecuteValues<T>(IReadOnlyList<(EditorElementModel e, T value)> oldValues, IReadOnlyList<(EditorElementModel e, T value)> newValues, Action<EditorElementModel, T> apply)
    {
        _history.Execute(new DelegateEditorCommand(() => newValues.ToList().ForEach(x => apply(x.e, x.value)), () => oldValues.ToList().ForEach(x => apply(x.e, x.value))));
        NotifyCommands();
    }
    private double ClampX(EditorElementModel e, double value, bool snap) => Math.Clamp(Snap(value, snap), _canvas.SafeArea.Left, Math.Max(_canvas.SafeArea.Left, _canvas.Orientation.CanvasWidth - _canvas.SafeArea.Right - e.Width));
    private double ClampY(EditorElementModel e, double value, bool snap) => Math.Clamp(Snap(value, snap), _canvas.SafeArea.Top, Math.Max(_canvas.SafeArea.Top, _canvas.Orientation.CanvasHeight - _canvas.SafeArea.Bottom - e.Height));
    private double Snap(double value, bool enabled) => enabled && _canvas.SnapGridSize > 1 ? Math.Round(value / _canvas.SnapGridSize) * _canvas.SnapGridSize : value;
    private string NextId(string source) { var i = 2; var id = $"{source}-{i}"; while (_canvas.Elements.Any(e => e.ElementId == id)) id = $"{source}-{++i}"; return id; }
    private void NotifyCommands() { OnPropertyChanged(nameof(CanUndo)); OnPropertyChanged(nameof(CanRedo)); UndoCommand.NotifyCanExecuteChanged(); RedoCommand.NotifyCanExecuteChanged(); DeleteCommand.NotifyCanExecuteChanged(); DuplicateCommand.NotifyCanExecuteChanged(); }
}
