using System.Text.Json.Nodes;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class ConfigurationTests
{
    [Fact]
    public void Schema_migrates_v1_timeout()
    {
        var result = ConfigurationSchema.Migrate(new JsonObject { ["session_timeout_seconds"] = 60 }, 1);
        Assert.Equal(60, result["session"]!["timer_seconds"]!.GetValue<int>());
    }

    [Fact]
    public void Secret_nested_field_is_rejected()
    {
        Assert.Throws<ConfigurationException>(() => ConfigurationSchema.ValidateAndNormalize(
            new JsonObject { ["camera"] = new JsonObject { ["device_token"] = "x" } },
            new ConfigurationValidationOptions(UnknownFieldPolicy.Preserve), out _));
    }
}
