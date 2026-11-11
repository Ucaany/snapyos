using SnapyOS.Core;
using SnapyOS.LocalStore;
using Xunit;

namespace SnapyOS.LocalStore.Tests;

public sealed class CalibrationRepositoryTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-calibration-{Guid.NewGuid():N}");
    private readonly LocalStore _store;
    private readonly CalibrationRepository _repository;

    public CalibrationRepositoryTests()
    {
        _store = new LocalStore(LocalStoreOptions.ForDirectory(_root));
        _repository = new CalibrationRepository(_store);
    }

    [Fact]
    public void Saves_reads_and_resets_profile_per_camera_orientation()
    {
        var profile = new CameraCalibrationProfile("camera", MonitorOrientation.Portrait, 0, 0, 1, 1, CameraRotation.Clockwise90, true, new(0, 0, 1, 1), CalibrationGridStyle.CenterCross, DateTimeOffset.UtcNow);
        _repository.Save(profile);
        Assert.Equal(profile, _repository.Read("camera", MonitorOrientation.Portrait));
        Assert.Null(_repository.Read("camera", MonitorOrientation.Landscape));
        Assert.Single(_repository.ReadAll("camera"));
        _repository.Reset("camera", MonitorOrientation.Portrait);
        Assert.Null(_repository.Read("camera", MonitorOrientation.Portrait));
    }

    public void Dispose()
    {
        _store.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }
}
