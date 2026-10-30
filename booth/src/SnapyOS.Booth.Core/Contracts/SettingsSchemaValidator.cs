using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SnapyOS.Booth.Core.Contracts;

/// <summary>
/// Validator JSON Schema ringkas untuk kontrak setelan booth.
///
/// Hanya mendukung kata kunci yang benar-benar dipakai
/// <c>booth/contracts/device-settings.schema.json</c> (type, enum, const,
/// minimum/maximum, minLength/maxLength, pattern, minItems/maxItems, items,
/// properties, additionalProperties:false, required, anyOf, $ref). Validator
/// generik hanya akan menambah permukaan, bukan kepercayaan — schema tetap satu
/// sumber kebenaran dan berkas yang sama menggerakkan model C#.
/// </summary>
public static class SettingsSchemaValidator
{
    public sealed record Issue(string Path, string Message);

    public static IReadOnlyList<Issue> Validate(JsonNode? instance, JsonNode schemaRoot)
    {
        var issues = new List<Issue>();
        ValidateNode(instance, schemaRoot, schemaRoot, string.Empty, issues);
        return issues;
    }

    private static void ValidateNode(
        JsonNode? instance,
        JsonNode schema,
        JsonNode root,
        string path,
        List<Issue> issues)
    {
        if (schema["$ref"] is JsonValue reference)
        {
            var resolved = ResolveRef(root, reference.GetValue<string>());
            if (resolved is not null)
            {
                ValidateNode(instance, resolved, root, path, issues);
            }
            return;
        }

        if (schema["anyOf"] is JsonArray anyOf)
        {
            var branch = anyOf.FirstOrDefault((candidate) =>
            {
                var probe = new List<Issue>();
                ValidateNode(instance, candidate!, root, path, probe);
                return probe.Count == 0;
            });
            if (branch is null)
            {
                issues.Add(new Issue(path, "nilai tidak cocok dengan salah satu bentuk yang diizinkan"));
            }
            return;
        }

        if (schema["const"] is JsonValue constant && !NodeEquals(instance, constant))
        {
            issues.Add(new Issue(path, "nilai tidak sama dengan konstanta yang diwajibkan"));
            return;
        }

        if (schema["enum"] is JsonArray allowed && !allowed.Any((value) => NodeEquals(instance, value)))
        {
            issues.Add(new Issue(path, "nilai di luar daftar yang diizinkan"));
            return;
        }

        var types = ReadTypes(schema["type"]);
        if (types.Count > 0)
        {
            if (instance is null)
            {
                if (!types.Contains("null"))
                {
                    issues.Add(new Issue(path, $"tipe harus {string.Join(" | ", types)}"));
                }
                return;
            }
            if (!types.Any((type) => MatchesType(instance, type)))
            {
                issues.Add(new Issue(path, $"tipe harus {string.Join(" | ", types)}"));
                return;
            }
        }
        else if (instance is null)
        {
            return;
        }

        if (instance is JsonValue scalar)
        {
            ValidateScalar(scalar, schema, path, issues);
            return;
        }

        if (instance is JsonArray array)
        {
            ValidateArray(array, schema, root, path, issues);
            return;
        }

        if (instance is JsonObject obj)
        {
            ValidateObject(obj, schema, root, path, issues);
        }
    }

    private static void ValidateScalar(JsonValue value, JsonNode schema, string path, List<Issue> issues)
    {
        var text = value.TryGetValue(out string? asString) ? asString : null;
        if (text is not null)
        {
            if (schema["minLength"] is JsonValue min && text.Length < min.GetValue<int>())
            {
                issues.Add(new Issue(path, $"panjang minimal {min.GetValue<int>()} karakter"));
            }
            if (schema["maxLength"] is JsonValue max && text.Length > max.GetValue<int>())
            {
                issues.Add(new Issue(path, $"panjang maksimal {max.GetValue<int>()} karakter"));
            }
            if (schema["pattern"] is JsonValue pattern && !Regex.IsMatch(text, pattern.GetValue<string>()))
            {
                issues.Add(new Issue(path, "format nilai tidak sesuai"));
            }
            if (schema["format"] is JsonValue format
                && format.GetValue<string>() == "uri"
                && !Uri.TryCreate(text, UriKind.Absolute, out _))
            {
                issues.Add(new Issue(path, "harus URL absolut"));
            }
            return;
        }

        if (value.TryGetValue(out double number))
        {
            if (schema["minimum"] is JsonValue min && number < min.GetValue<double>())
            {
                issues.Add(new Issue(path, $"nilai minimal {min.GetValue<double>()}"));
            }
            if (schema["maximum"] is JsonValue max && number > max.GetValue<double>())
            {
                issues.Add(new Issue(path, $"nilai maksimal {max.GetValue<double>()}"));
            }
        }
    }

    private static void ValidateArray(JsonArray array, JsonNode schema, JsonNode root, string path, List<Issue> issues)
    {
        if (schema["minItems"] is JsonValue min && array.Count < min.GetValue<int>())
        {
            issues.Add(new Issue(path, $"minimal {min.GetValue<int>()} item"));
        }
        if (schema["maxItems"] is JsonValue max && array.Count > max.GetValue<int>())
        {
            issues.Add(new Issue(path, $"maksimal {max.GetValue<int>()} item"));
        }
        if (schema["items"] is JsonNode itemSchema)
        {
            for (var index = 0; index < array.Count; index += 1)
            {
                ValidateNode(array[index], itemSchema, root, $"{path}[{index}]", issues);
            }
        }
    }

    private static void ValidateObject(JsonObject obj, JsonNode schema, JsonNode root, string path, List<Issue> issues)
    {
        if (schema["required"] is JsonArray required)
        {
            foreach (var entry in required)
            {
                var key = entry?.GetValue<string>();
                if (key is not null && !obj.ContainsKey(key))
                {
                    issues.Add(new Issue(Join(path, key), "wajib diisi"));
                }
            }
        }

        if (schema["properties"] is not JsonObject properties)
        {
            return;
        }

        var additional = schema["additionalProperties"];
        var allowAdditional = additional is null || additional.GetValue<bool>();

        foreach (var (key, value) in obj)
        {
            var childPath = Join(path, key);
            if (properties[key] is JsonNode propertySchema)
            {
                ValidateNode(value, propertySchema, root, childPath, issues);
            }
            else if (!allowAdditional)
            {
                issues.Add(new Issue(childPath, "kunci tidak dikenal"));
            }
        }
    }

    private static string Join(string path, string key) => path.Length == 0 ? key : $"{path}.{key}";

    private static List<string> ReadTypes(JsonNode? node)
    {
        var result = new List<string>();
        switch (node)
        {
            case JsonValue value when value.TryGetValue(out string? single):
                result.Add(single!);
                break;
            case JsonArray array:
                result.AddRange(array.Select((entry) => entry!.GetValue<string>()));
                break;
        }
        return result;
    }

    private static bool MatchesType(JsonNode instance, string type) => type switch
    {
        "object" => instance is JsonObject,
        "array" => instance is JsonArray,
        "string" => instance is JsonValue value && value.TryGetValue(out string? _),
        "number" => instance is JsonValue number && number.TryGetValue(out double _),
        "integer" => instance is JsonValue integer && integer.TryGetValue(out long _),
        "boolean" => instance is JsonValue boolean && boolean.TryGetValue(out bool _),
        "null" => false,
        _ => true,
    };

    private static JsonNode? ResolveRef(JsonNode root, string reference)
    {
        const string prefix = "#/$defs/";
        if (!reference.StartsWith(prefix, StringComparison.Ordinal))
        {
            return null;
        }
        return root["$defs"]?[reference[prefix.Length..]];
    }

    /// <summary>
    /// Kesetaraan dua node untuk nilai enum/const. Nilai ini skalar
    /// (string/number/boolean), jadi perbandingan teks JSON kanonik memadai dan
    /// tidak bergantung pada <c>JsonNode.DeepEquals</c> (.NET 9+).
    /// </summary>
    private static bool NodeEquals(JsonNode? left, JsonNode? right)
    {
        if (left is null || right is null)
        {
            return left is null && right is null;
        }
        return string.Equals(left.ToJsonString(), right.ToJsonString(), StringComparison.Ordinal);
    }
}
