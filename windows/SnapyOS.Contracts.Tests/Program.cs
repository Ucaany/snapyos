using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using SnapyOS.Contracts;

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var theme = new BrandTheme
{
    BrandName = "KLIK FOTO",
    BackgroundColor = "#FFFFFF",
    TextColor = "#111111",
    IsBoothOverride = true
};

Assert(ContractValidator.Validate(theme).Count == 0, "Valid theme must pass validation.");
Assert(ContractValidator.Validate(theme with { TextColor = "#EEEEEE" }).Count > 0, "Low contrast must fail validation.");
Assert(ContractValidator.Validate(new SessionPolicy { TimerSeconds = 60, WarningSeconds = 60 }).Count > 0, "Warning must be shorter than timer.");

var pairing = new PairingState
{
    Status = PairingStatus.Paired,
    CloudDeviceId = "device-01",
    DeviceToken = "must-not-serialize"
};
var json = ContractJson.Serialize(pairing);
using var document = JsonDocument.Parse(json);
Assert(document.RootElement.GetProperty("schemaVersion").GetInt32() == ContractSchema.CurrentVersion, "Schema version missing.");
Assert(document.RootElement.GetProperty("status").GetString() == "Paired", "Enums must serialize as strings.");
Assert(!json.Contains("deviceToken", StringComparison.OrdinalIgnoreCase), "Device token leaked into JSON.");

var template = new TemplateCatalogItem
{
    TemplateId = "template-01",
    Name = "Strip",
    Category = "photostrip",
    SlotCount = 2,
    Elements = [new CanvasElement { ElementId = "frame", Kind = ElementKind.Frame, Width = 1200, Height = 1800 }],
    Assets = [new AssetManifest { AssetId = "frame-asset", ObjectKey = "business/templates/frame.png", ContentType = "image/png", SizeBytes = 10, Sha256 = new string('a', 64) }],
    IsActive = true
};
Assert(ContractValidator.Validate(template).Count == 0, "Nested template contract must pass validation.");

Console.WriteLine("SnapyOS.Contracts JSON and validation checks: PASS");
