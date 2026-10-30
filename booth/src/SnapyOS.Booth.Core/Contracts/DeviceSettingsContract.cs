using System.Reflection;
using System.Text.Json.Nodes;
using SnapyOS.Booth.Contracts;

namespace SnapyOS.Booth.Core.Contracts;

/// <summary>
/// Memuat kontrak setelan yang di-embed dari
/// <c>booth/contracts/device-settings.schema.json</c> — berkas yang sama yang
/// menggerakkan model C# dan tipe TS. Aplikasi booth tidak membaca berkas repo
/// saat berjalan; schema tertanam di assembly.
/// </summary>
public static class SettingsContractSchema
{
    private static readonly Lazy<JsonNode> SchemaRoot = new(() =>
    {
        var assembly = Assembly.GetExecutingAssembly();
        const string resourceName = "SnapyOS.Booth.Core.device-settings.schema.json";
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Sumber daya kontrak tidak ditemukan: {resourceName}");
        using var reader = new StreamReader(stream);
        return JsonNode.Parse(reader.ReadToEnd())
            ?? throw new InvalidOperationException("Kontrak setelan tidak bisa di-parse.");
    });

    public static JsonNode Schema => SchemaRoot.Value;

    public static int SchemaVersion => Schema["x-snapyos-schema-version"]!.GetValue<int>();

    public static string[] Groups =>
        Schema["x-snapyos-groups"]!.AsArray().Select((node) => node!.GetValue<string>()).ToArray();

    public static string[] CloudSyncedGroups =>
        Schema["x-snapyos-cloud-synced-groups"]!.AsArray().Select((node) => node!.GetValue<string>()).ToArray();

    public static string[] LocalOnlyGroups =>
        Schema["x-snapyos-local-only-groups"]!.AsArray().Select((node) => node!.GetValue<string>()).ToArray();

    public static string SecretKeyPrefix => Schema["x-snapyos-secret-key-prefix"]!.GetValue<string>();

    /// <summary>Field di grup yang bukan milik device (ditolak 403 saat ditulis device).</summary>
    public static string[] CloudOwnedFields(string group) =>
        Schema["x-snapyos-cloud-owned-fields"]?[group] is JsonArray owned
            ? owned.Select((node) => node!.GetValue<string>()).ToArray()
            : [];

    /// <summary>Semua field yang dikenal untuk satu grup.</summary>
    public static string[] Fields(string group)
    {
        var definition = DefinitionOf(group);
        return definition["properties"] is JsonObject properties
            ? properties.Select((pair) => pair.Key).ToArray()
            : [];
    }

    /// <summary>
    /// Invarian lintas-field untuk satu definisi <c>$defs</c>. Aturannya ditulis di
    /// <c>x-snapyos-invariants</c>, diparse generator, dan sampai ke sini lewat
    /// <c>DeviceSettingsContract.Invariants</c>, bukan disalin manual.
    /// </summary>
    public static SettingInvariant[] InvariantsFor(string definitionName) =>
        DeviceSettingsContract.Invariants.TryGetValue(definitionName, out var invariants)
            ? invariants
            : [];

    /// <summary>Field yang boleh ditulis device: field grup minus field cloud-owned.</summary>
    public static string[] DeviceWritableFields(string group)
    {
        var owned = new HashSet<string>(CloudOwnedFields(group), StringComparer.Ordinal);
        return Fields(group).Where((field) => !owned.Contains(field)).ToArray();
    }

    private static JsonNode DefinitionOf(string group)
    {
        if (Schema["properties"]?[group]?["$ref"] is not JsonValue reference)
        {
            throw new ArgumentOutOfRangeException(nameof(group), group, "Grup setelan tidak dikenal.");
        }
        return Schema["$defs"]![DefinitionName(reference.GetValue<string>())]!;
    }

    /// <summary>Nama definisi <c>$defs</c> dari sebuah <c>$ref</c> lokal.</summary>
    private static string DefinitionName(string reference)
    {
        const string prefix = "#/$defs/";
        if (!reference.StartsWith(prefix, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"$ref tidak lokal: {reference}");
        }
        return reference[prefix.Length..];
    }
}
