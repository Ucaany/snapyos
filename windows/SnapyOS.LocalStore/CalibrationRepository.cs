using System.Text.Json;
using Microsoft.Data.Sqlite;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed class CalibrationRepository(LocalStore store)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly LocalStore _store = store;

    public void Save(CameraCalibrationProfile profile)
    {
        _store.Execute(@"CREATE TABLE IF NOT EXISTS camera_calibrations(camera_id TEXT NOT NULL, orientation TEXT NOT NULL, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(camera_id, orientation));", null);
        _store.Execute(@"INSERT INTO camera_calibrations(camera_id, orientation, profile_json, updated_at) VALUES($camera, $orientation, $json, $updated) ON CONFLICT(camera_id, orientation) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at;", null,
            ("$camera", profile.CameraId), ("$orientation", profile.Orientation.ToString()), ("$json", JsonSerializer.Serialize(profile, Json)), ("$updated", profile.UpdatedAt.ToString("O")));
    }

    public CameraCalibrationProfile? Read(string cameraId, MonitorOrientation orientation)
    {
        _store.Execute(@"CREATE TABLE IF NOT EXISTS camera_calibrations(camera_id TEXT NOT NULL, orientation TEXT NOT NULL, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(camera_id, orientation));", null);
        using var command = _store.CreatePublicCommand("SELECT profile_json FROM camera_calibrations WHERE camera_id=$camera AND orientation=$orientation;", ("$camera", cameraId), ("$orientation", orientation.ToString()));
        using var reader = command.ExecuteReader();
        return reader.Read() ? JsonSerializer.Deserialize<CameraCalibrationProfile>(reader.GetString(0), Json) : null;
    }

    public IReadOnlyList<CameraCalibrationProfile> ReadAll(string cameraId)
    {
        _store.Execute(@"CREATE TABLE IF NOT EXISTS camera_calibrations(camera_id TEXT NOT NULL, orientation TEXT NOT NULL, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(camera_id, orientation));", null);
        using var command = _store.CreatePublicCommand("SELECT profile_json FROM camera_calibrations WHERE camera_id=$camera ORDER BY orientation;", ("$camera", cameraId));
        using var reader = command.ExecuteReader();
        var profiles = new List<CameraCalibrationProfile>();
        while (reader.Read())
        {
            var profile = JsonSerializer.Deserialize<CameraCalibrationProfile>(reader.GetString(0), Json);
            if (profile is not null) profiles.Add(profile);
        }
        return profiles;
    }

    public void Reset(string cameraId, MonitorOrientation orientation)
    {
        _store.Execute("DELETE FROM camera_calibrations WHERE camera_id=$camera AND orientation=$orientation;", null, ("$camera", cameraId), ("$orientation", orientation.ToString()));
    }
}
