using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;

namespace SnapyOS.Booth.Core.Exit;

/// <summary>
/// Verifikasi PIN keluar dengan argon2id — interoperabel dengan
/// <c>verifyDevicePin</c> cloud (<c>@node-rs/argon2</c>).
///
/// Hash disimpan sebagai encoded string PHC
/// <c>$argon2id$v=19$m=19456,t=2,p=1$&lt;salt-b64&gt;$&lt;hash-b64&gt;</c>.
/// Parameter dibaca dari hash (bukan konstanta), jadi bila cloud menaikkan cost
/// di kemudian hari booth tetap bisa memverifikasi hash lama.
/// </summary>
public static class Argon2idPin
{
    /// <summary>Format lain (mis. sha256 lama) selalu gagal — sama seperti Node.</summary>
    public static bool Verify(string pin, string encodedHash)
    {
        if (!encodedHash.StartsWith("$argon2", StringComparison.Ordinal))
        {
            return false;
        }
        try
        {
            var parsed = Parse(encodedHash);
            if (parsed is null)
            {
                return false;
            }
            var computed = Hash(pin, parsed.Value);
            return CryptographicOperations.FixedTimeEquals(computed, parsed.Value.Hash);
        }
        catch (Exception)
        {
            // Hash rusak tidak boleh menjatuhkan runtime; anggap tidak cocok.
            return false;
        }
    }

    /// <summary>Hitungan argon2id mentah (untuk uji interoperabilitas).</summary>
    public static byte[] Hash(string pin, Argon2Params parameters)
    {
        using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(pin))
        {
            Salt = parameters.Salt,
            DegreeOfParallelism = parameters.Parallelism,
            MemorySize = parameters.MemoryCostKib,
            Iterations = parameters.Iterations,
        };
        return argon2.GetBytes(parameters.Hash.Length);
    }

    public readonly record struct Argon2Params(
        string Variant,
        int Version,
        int MemoryCostKib,
        int Iterations,
        int Parallelism,
        byte[] Salt,
        byte[] Hash);

    private static Argon2Params? Parse(string encoded)
    {
        // $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
        var parts = encoded.Split('$');
        if (parts.Length != 6 || parts[0].Length != 0)
        {
            return null;
        }
        var variant = parts[1];
        if (!variant.StartsWith("argon2", StringComparison.Ordinal))
        {
            return null;
        }
        var versionPart = parts[2];
        if (!versionPart.StartsWith("v=", StringComparison.Ordinal)
            || !int.TryParse(versionPart[2..], out var version))
        {
            return null;
        }

        var memory = 0;
        var iterations = 0;
        var parallelism = 0;
        foreach (var segment in parts[3].Split(','))
        {
            var pair = segment.Split('=', 2);
            if (pair.Length != 2)
            {
                return null;
            }
            switch (pair[0])
            {
                case "m":
                    memory = int.Parse(pair[1]);
                    break;
                case "t":
                    iterations = int.Parse(pair[1]);
                    break;
                case "p":
                    parallelism = int.Parse(pair[1]);
                    break;
                default:
                    // Parameter tak dikenal (mis. keyid/data) → tolak, jangan menebak.
                    return null;
            }
        }
        if (memory <= 0 || iterations <= 0 || parallelism <= 0)
        {
            return null;
        }

        return new Argon2Params(
            variant,
            version,
            memory,
            iterations,
            parallelism,
            DecodeBase64(parts[4]),
            DecodeBase64(parts[5]));
    }

    /// <summary>Base64 PHC tanpa padding; tambahkan padding agar bisa didekode.</summary>
    private static byte[] DecodeBase64(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2:
                padded += "==";
                break;
            case 3:
                padded += "=";
                break;
        }
        return Convert.FromBase64String(padded);
    }
}
