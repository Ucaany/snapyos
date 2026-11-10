using System.Windows;
using SnapyOS.Contracts;
using SnapyOS.Wpf.Editor;
using Xunit;

namespace SnapyOS.Wpf.Tests;

public sealed class EditorControllerTests
{
    [Fact]
    public void Move_snaps_and_respects_safe_area()
    {
        var canvas = new EditorCanvasModel();
        var element = new EditorElementModel("welcome", ElementKind.Text, "customer instruction") { X = 100, Y = 100 };
        var controller = new EditorCanvasController(canvas);
        controller.Add(element);
        controller.Select("welcome");

        controller.MoveSelected(-200, -200);

        Assert.Equal(32, element.X);
        Assert.Equal(32, element.Y);
    }

    [Fact]
    public void Locked_element_does_not_move_or_delete()
    {
        var canvas = new EditorCanvasModel();
        var element = new EditorElementModel("qr", ElementKind.QrCode, "result handoff") { IsLocked = true };
        var controller = new EditorCanvasController(canvas);
        controller.Add(element);
        controller.Select("qr");

        controller.MoveSelected(40, 40);
        controller.DeleteSelected();

        Assert.Contains(element, canvas.Elements);
        Assert.Equal(0, element.X);
    }

    [Fact]
    public void Duplicate_creates_unique_purposeful_element_and_undoes()
    {
        var canvas = new EditorCanvasModel();
        var controller = new EditorCanvasController(canvas);
        controller.Add(new EditorElementModel("frame", ElementKind.Frame, "photo framing"));
        controller.Select("frame");

        controller.DuplicateSelected();

        Assert.Equal(2, canvas.Elements.Count);
        Assert.Contains(canvas.Elements, item => item.ElementId == "frame-2" && item.Purpose == "photo framing");
        controller.Undo();
        Assert.Single(canvas.Elements);
    }

    [Fact]
    public void Align_uses_safe_area_for_edges()
    {
        var canvas = new EditorCanvasModel();
        var element = new EditorElementModel("image", ElementKind.Image, "approved brand asset");
        var controller = new EditorCanvasController(canvas);
        controller.Add(element);
        controller.Select("image");

        controller.AlignSelected(HorizontalAlignment.Right, VerticalAlignment.Bottom);

        Assert.Equal(1008, element.X);
        Assert.Equal(688, element.Y);
    }
}
