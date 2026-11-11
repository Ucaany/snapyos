using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class ResultManifestTests
{
    [Fact]
    public void Manifest_is_local_only_before_ack()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("photo_strip", "/media/strip.jpg", 10, new string('a', 64), "jpeg"), new("gif", "/media/result.gif", 20, new string('b', 64), "gif")], DateTimeOffset.UtcNow.AddDays(3));
        Assert.Equal(ResultUploadState.PendingUpload, manifest.UploadState);
        Assert.Equal(ResultAccessState.LocalOnly, manifest.AccessState);
        Assert.Throws<InvalidOperationException>(() => ResultManifestFactory.QrPayload(manifest));
        Assert.False(manifest.HasRawPhoto);
    }

    [Fact]
    public void Upload_ack_enables_public_qr()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("photo_strip", "/media/strip.jpg", 10, new string('a', 64), "jpeg")], DateTimeOffset.UtcNow.AddDays(3));
        var uploading = ResultManifestFactory.MarkUploading(manifest);
        var acked = ResultManifestFactory.ApplyAck(uploading, new("result-token", "https://example.test/r/result-token"));
        Assert.Equal(ResultUploadState.CloudAcked, acked.UploadState);
        Assert.Equal(ResultAccessState.PublicQrReady, acked.AccessState);
        Assert.Equal("https://example.test/r/result-token", ResultManifestFactory.QrPayload(acked));
    }

    [Fact]
    public void Ack_before_upload_is_rejected_and_duplicate_ack_is_idempotent()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, new string('a', 64), "gif")], DateTimeOffset.UtcNow.AddDays(3));
        var ack = new CloudResultAck("result-token", "https://example.test/r/result-token");
        Assert.Throws<InvalidOperationException>(() => ResultManifestFactory.ApplyAck(manifest, ack));
        var acked = ResultManifestFactory.ApplyAck(ResultManifestFactory.MarkUploading(manifest), ack);
        Assert.Equal(acked, ResultManifestFactory.ApplyAck(acked, ack));
        Assert.Throws<InvalidOperationException>(() => ResultManifestFactory.ApplyAck(acked, new("other-token", "https://example.test/r/other-token")));
        Assert.Throws<ArgumentException>(() => ResultManifestFactory.ApplyAck(ResultManifestFactory.MarkUploading(manifest), new("short", "https://example.test/r/short")));
        Assert.Throws<ArgumentException>(() => ResultManifestFactory.ApplyAck(ResultManifestFactory.MarkUploading(manifest), new("result-token", "http://example.test/r/result-token")));
    }

    [Fact]
    public void Failed_upload_is_local_fallback_and_can_retry()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, new string('a', 64), "gif")], DateTimeOffset.UtcNow.AddDays(3));
        var failed = ResultManifestFactory.MarkFailed(ResultManifestFactory.MarkUploading(manifest));
        Assert.Equal(ResultAccessState.LocalOnly, failed.AccessState);
        Assert.Throws<InvalidOperationException>(() => ResultManifestFactory.QrPayload(failed));
        Assert.Equal(ResultUploadState.Uploading, ResultManifestFactory.MarkUploading(failed).UploadState);
    }

    [Fact]
    public void Expired_manifest_cannot_generate_qr()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, new string('a', 64), "gif")], DateTimeOffset.UtcNow.AddDays(-1));
        var acked = ResultManifestFactory.ApplyAck(ResultManifestFactory.MarkUploading(manifest), new("result-token", "https://example.test/r/result-token"));
        var expired = ResultManifestFactory.MarkExpired(acked, DateTimeOffset.UtcNow);
        Assert.Equal(ResultAccessState.Expired, expired.AccessState);
        Assert.Throws<InvalidOperationException>(() => ResultManifestFactory.QrPayload(expired));
    }

    [Fact]
    public void Rejects_raw_photo_and_invalid_checksum_metadata()
    {
        Assert.Throws<ArgumentException>(() => ResultManifestFactory.Create("session", "tx", [new("photo", "/media/raw.jpg", 10, new string('a', 64), "jpeg")], DateTimeOffset.UtcNow.AddDays(3)));
        Assert.Throws<ArgumentException>(() => ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, "not-a-checksum", "gif")], DateTimeOffset.UtcNow.AddDays(3)));
    }

    [Fact]
    public void Raw_photo_paths_are_reduced_to_file_names()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("photo_strip", "/private/media/strip.jpg", 10, new string('a', 64), "jpeg")], DateTimeOffset.UtcNow.AddDays(3));
        Assert.Equal("strip.jpg", manifest.Outputs[0].FileName);
        Assert.DoesNotContain("/private", System.Text.Json.JsonSerializer.Serialize(manifest));
        Assert.False(manifest.HasRawPhoto);
    }

    [Fact]
    public void Ack_retention_cannot_shorten_local_retention()
    {
        var retention = DateTimeOffset.UtcNow.AddDays(3);
        var manifest = ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, new string('a', 64), "gif")], retention);
        var acked = ResultManifestFactory.ApplyAck(ResultManifestFactory.MarkUploading(manifest), new("result-token", "https://example.test/r/result-token", retention.AddDays(-1)));
        Assert.Equal(retention, acked.RetentionUntil);
    }
}
