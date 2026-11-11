namespace SnapyOS.Wpf.Editor;

public interface IEditorCommand
{
    void Execute();
    void Undo();
}

public sealed class EditorCommandHistory
{
    private readonly Stack<IEditorCommand> _undo = new();
    private readonly Stack<IEditorCommand> _redo = new();

    public bool CanUndo => _undo.Count > 0;
    public bool CanRedo => _redo.Count > 0;

    public void Execute(IEditorCommand command)
    {
        command.Execute();
        _undo.Push(command);
        _redo.Clear();
    }

    public void Undo()
    {
        if (_undo.Count == 0) return;
        var command = _undo.Pop();
        command.Undo();
        _redo.Push(command);
    }

    public void Redo()
    {
        if (_redo.Count == 0) return;
        var command = _redo.Pop();
        command.Execute();
        _undo.Push(command);
    }
}

internal sealed class DelegateEditorCommand(Action execute, Action undo) : IEditorCommand
{
    public void Execute() => execute();
    public void Undo() => undo();
}
