using System.Text.Json.Nodes;
using SnapyOS.Core;
using SnapyOS.LocalStore;
using Xunit;

namespace SnapyOS.LocalStore.Tests;

public sealed class ConfigurationRepositoryTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-config-{Guid.NewGuid():N}");
    private readonly LocalStore _store;
    private readonly ConfigurationRepository _repository;

    public ConfigurationRepositoryTests()
    {
        _store = new LocalStore(LocalStoreOptions.ForDirectory(_root));
        _repository = new ConfigurationRepository(_store);
    }

    [Fact]
    public async Task Valid_config_becomes_active()
    {
        var draft = _repository.SaveDraft(ValidValues());
        var result = await _repository.ApplyAsync(new Health(true));
        Assert.Equal(draft.RevisionId, result.ActiveRevisionId);
        Assert.Equal(draft.RevisionId, _repository.Active!.RevisionId);
    }

    [Fact]
    public void Invalid_config_is_rejected()
    {
        Assert.Throws<ConfigurationException>(() => _repository.SaveDraft(new JsonObject
        {
            ["session"] = new JsonObject { ["warning_seconds"] = 60 }
        }));
    }

    [Fact]
    public async Task Failed_health_does_not_activate_draft()
    {
        _repository.SaveDraft(ValidValues());
        await Assert.ThrowsAsync<ConfigurationException>(() => _repository.ApplyAsync(new Health(false)));
        Assert.Null(_repository.Active);
    }

    [Fact]
    public async Task Restart_uses_active_revision()
    {
        var draft = _repository.SaveDraft(ValidValues());
        await _repository.ApplyAsync(new Health(true));
        using var reopenedStore = new LocalStore(LocalStoreOptions.ForDirectory(_root));
        var reopened = new ConfigurationRepository(reopenedStore);
        Assert.Equal(draft.RevisionId, reopened.Active!.RevisionId);
    }

    [Fact]
    public void Old_schema_is_migrated()
    {
        var imported = _repository.Import("{\"schemaVersion\":1,\"values\":{\"session_timeout_seconds\":300}}");
        Assert.Equal(ConfigurationSchema.CurrentVersion, imported.SchemaVersion);
        Assert.Equal(300, imported.Values["session"]!["timer_seconds"]!.GetValue<int>());
    }

    [Fact]
    public void New_schema_is_rejected()
    {
        Assert.Throws<ConfigurationException>(() => _repository.Import("{\"schemaVersion\":99,\"values\":{}}"));
    }

    [Fact]
    public void Unknown_fields_follow_policy()
    {
        Assert.Throws<ConfigurationException>(() => _repository.SaveDraft(new JsonObject { ["future"] = true }));
        var draft = _repository.SaveDraft(new JsonObject { ["future"] = true }, new ConfigurationValidationOptions(UnknownFieldPolicy.Preserve));
        Assert.True(draft.UnknownFields!["future"]!.GetValue<bool>());
    }

    [Fact]
    public void Secret_fields_are_rejected()
    {
        Assert.Throws<ConfigurationException>(() => _repository.SaveDraft(new JsonObject { ["api_key"] = "secret" }, new ConfigurationValidationOptions(UnknownFieldPolicy.Preserve)));
    }

    private static JsonObject ValidValues() => new()
    {
        ["camera"] = new JsonObject { ["provider"] = "Bridge" },
        ["printer"] = new JsonObject { ["kind"] = "Windows" },
        ["session"] = new JsonObject { ["timer_seconds"] = 300 }
    };

    public void Dispose()
    {
        _store.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }

    private sealed class Health(bool result) : IConfigurationHealthCheck
    {
        public Task<bool> CheckAsync(ConfigurationDocument configuration, CancellationToken cancellationToken = default) => Task.FromResult(result);
    }
}
