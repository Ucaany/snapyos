/**
 * Anti-drift kontrak setelan booth.
 *
 * Kontrak hidup di satu tempat: `booth/contracts/device-settings.schema.json`.
 * Tes ini menegakkan tiga sisi bergerak bersama:
 * - JSON Schema (sumber tunggal, di-generate ke TS + C#)
 * - validator zod (`src/lib/validators.ts`, kontrak input cloud & runtime)
 * - daftar adapter tersimpan runtime (`runtime/settings/index.ts`)
 *
 * Tanpa tes ini, menambah field hanya di zod akan lolos di cloud dan ditolak
 * diam-diam oleh booth (atau sebaliknya), dan model C# bisa menyimpang tanpa
 * ada yang menangkapnya.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  CLOUD_OWNED_SETTING_FIELDS,
  CLOUD_SYNCED_DEVICE_GROUPS,
  DEVICE_SETTING_FIELDS,
  DEVICE_SETTING_GROUPS,
  LOCAL_ONLY_DEVICE_GROUPS,
  deviceSettingFields,
  sessionSettingsSchema,
  zodDeviceSettingFields,
} from "../src/lib/validators.ts";
import {
  SETTING_INVARIANTS,
  SETTINGS_SCHEMA_VERSION,
  type DeviceSettingGroupName,
} from "../src/lib/generated/device-settings.gen.ts";
import { STORED_BRIDGE_KINDS } from "../runtime/settings/index.ts";

const schema = JSON.parse(
  readFileSync(new URL("../booth/contracts/device-settings.schema.json", import.meta.url), "utf8")
) as {
  "x-snapyos-schema-version": number;
  "x-snapyos-groups": string[];
  "x-snapyos-cloud-synced-groups": string[];
  "x-snapyos-local-only-groups": string[];
  "x-snapyos-cloud-owned-fields": Record<string, string[]>;
  $defs: Record<string, { enum?: string[] }>;
};

function schemaGroupFields(group: string): string[] {
  const ref = schema.$defs;
  const name =
    group === "camera_settings"
      ? "cameraSettings"
      : group === "print_settings"
        ? "printSettings"
        : group === "session_settings"
          ? "sessionSettings"
          : "appearanceSettings";
  const def = ref[name] as unknown as { properties: Record<string, unknown> };
  return Object.keys(def.properties);
}

test("grup schema ≡ grup validators.ts", () => {
  assert.deepEqual([...schema["x-snapyos-groups"]], [...DEVICE_SETTING_GROUPS]);
});

test("versi schema ≡ SETTINGS_SCHEMA_VERSION", () => {
  assert.equal(schema["x-snapyos-schema-version"], SETTINGS_SCHEMA_VERSION);
});

test("cloud-synced + local-only = seluruh grup (tanpa tumpang tindih)", () => {
  const fromSchema = [
    ...schema["x-snapyos-cloud-synced-groups"],
    ...schema["x-snapyos-local-only-groups"],
  ];
  assert.deepEqual([...DEVICE_SETTING_GROUPS].sort(), fromSchema.sort());
  assert.deepEqual([...CLOUD_SYNCED_DEVICE_GROUPS], [...schema["x-snapyos-cloud-synced-groups"]]);
  assert.deepEqual([...LOCAL_ONLY_DEVICE_GROUPS], [...schema["x-snapyos-local-only-groups"]]);
});

test("field cloud-owned ada di dalam grup milik device", () => {
  for (const group of DEVICE_SETTING_GROUPS) {
    const fields = schemaGroupFields(group);
    for (const owned of CLOUD_OWNED_SETTING_FIELDS[group]) {
      assert.ok(fields.includes(owned), `${group}.${owned} tidak ada di schema`);
    }
    assert.deepEqual(
      [...CLOUD_OWNED_SETTING_FIELDS[group]],
      [...(schema["x-snapyos-cloud-owned-fields"][group] ?? [])]
    );
  }
});

test("daftar field zod ≡ daftar field JSON Schema (anti-drift)", () => {
  for (const group of DEVICE_SETTING_GROUPS) {
    assert.deepEqual(
      zodDeviceSettingFields(group).sort(),
      schemaGroupFields(group).sort(),
      `field ${group} berbeda antara zod dan JSON Schema`
    );
  }
});

test("DEVICE_SETTING_FIELDS ter-generate ≡ field schema", () => {
  for (const group of DEVICE_SETTING_GROUPS) {
    assert.deepEqual([...DEVICE_SETTING_FIELDS[group]], schemaGroupFields(group));
  }
});

test("deviceSettingFields membuang field cloud-owned", () => {
  for (const group of DEVICE_SETTING_GROUPS) {
    const expected = schemaGroupFields(group).filter(
      (key) => !CLOUD_OWNED_SETTING_FIELDS[group].includes(key)
    );
    assert.deepEqual(deviceSettingFields(group).sort(), expected.sort());
  }
  assert.deepEqual(CLOUD_OWNED_SETTING_FIELDS.print_settings, ["copies", "layout"]);
});

test("adapter kamera runtime ⊆ enum provider di schema", () => {
  const provider = schema.$defs.cameraProvider?.enum ?? [];
  for (const kind of STORED_BRIDGE_KINDS) {
    assert.ok(provider.includes(kind), `provider ${kind} tidak ada di schema`);
  }
});

test("grup local-only konsisten dengan helper", () => {
  const localOnly = new Set<string>(LOCAL_ONLY_DEVICE_GROUPS);
  for (const group of DEVICE_SETTING_GROUPS) {
    assert.equal(
      localOnly.has(group),
      !(CLOUD_SYNCED_DEVICE_GROUPS as readonly string[]).includes(group)
    );
  }
  // memastikan tipe tetap terpakai
  const sample: DeviceSettingGroupName = "appearance_settings";
  assert.equal(sample, "appearance_settings");
});

// --- invarian lintas-field --------------------------------------------------

test("invarian schema sampai ke keluaran ter-generate", () => {
  const declared = (schema.$defs.sessionSettings as unknown as { "x-snapyos-invariants": string[] })[
    "x-snapyos-invariants"
  ];
  assert.deepEqual(declared, ["warning_seconds < timer_seconds"]);
  assert.deepEqual(SETTING_INVARIANTS.sessionSettings, [
    { left: "warning_seconds", op: "<", right: "timer_seconds" },
  ]);
});

test("payload warning ≥ timer ditolak zod (paritas dengan C#)", () => {
  // C#: SettingsServiceTests.write_rejects_warning_longer_than_timer_with_400
  // memakai payload yang sama dan mengharapkan 400 INVALID_SETTINGS.
  const payload = { timer_seconds: 60, warning_seconds: 120 };
  assert.equal(sessionSettingsSchema.safeParse(payload).success, false);
  assert.equal(
    sessionSettingsSchema.safeParse({ timer_seconds: 120, warning_seconds: 60 }).success,
    true
  );
});

test("form setelan UI booth ⊆ grup & field schema", () => {
  // `booth/ui/src/panels/BoothSettingsPanel.tsx` memilih field yang ditampilkan
  // (subset, bukan salinan), tetapi field yang tidak ada di schema atau milik
  // cloud tidak boleh lolos ke form: runtime akan menjawab 400/403.
  const panel = readFileSync(
    new URL("../booth/ui/src/panels/BoothSettingsPanel.tsx", import.meta.url),
    "utf8"
  );
  const matches = [...panel.matchAll(/\bkey:\s*"([a-z_]+)",\s*\n\s*title:/g)];
  assert.ok(matches.length > 0, "daftar grup UI tidak terbaca");
  matches.forEach((match, index) => {
    const group = match[1]!;
    assert.ok(
      (schema["x-snapyos-groups"] as string[]).includes(group),
      `grup UI ${group} tidak ada di schema`
    );
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? panel.length;
    const fields = [...panel.slice(start, end).matchAll(/\{\s*key:\s*"([A-Za-z0-9_]+)"/g)].map(
      (m) => m[1]!
    );
    assert.ok(fields.length > 0, `grup UI ${group} tanpa field`);
    const known = schemaGroupFields(group);
    const owned = schema["x-snapyos-cloud-owned-fields"][group] ?? [];
    for (const field of fields) {
      assert.ok(known.includes(field), `field UI ${group}.${field} tidak ada di schema`);
      assert.ok(!owned.includes(field), `field UI ${group}.${field} milik cloud`);
    }
  });
});

// --- determinisme & paritas TS ↔ C# -----------------------------------------

const GENERATOR = fileURLToPath(new URL("../booth/contracts/generate.mjs", import.meta.url));
const TS_GENERATED = new URL("../src/lib/generated/device-settings.gen.ts", import.meta.url);
const CS_GENERATED = new URL(
  "../booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs",
  import.meta.url
);

/** Jalankan generator ke direktori sementara, kembalikan isi kedua berkas. */
function generateInto(outDir: string): { ts: string; cs: string } {
  execFileSync(process.execPath, [GENERATOR, "--out-dir", outDir], { stdio: "pipe" });
  return {
    ts: readFileSync(join(outDir, "src", "lib", "generated", "device-settings.gen.ts"), "utf8"),
    cs: readFileSync(
      join(outDir, "booth", "src", "SnapyOS.Booth.Contracts", "DeviceSettings.g.cs"),
      "utf8"
    ),
  };
}

test("generator deterministik (dua jalankan byte-identik)", () => {
  const first = mkdtempSync(join(tmpdir(), "snapyos-contract-a-"));
  const second = mkdtempSync(join(tmpdir(), "snapyos-contract-b-"));
  try {
    const a = generateInto(first);
    const b = generateInto(second);
    assert.equal(a.ts, b.ts, "keluaran TS berbeda antar jalankan");
    assert.equal(a.cs, b.cs, "keluaran C# berbeda antar jalankan");
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test("berkas ter-generate di repo ≡ keluaran generator (anti-basi)", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapyos-contract-committed-"));
  try {
    const fresh = generateInto(dir);
    assert.equal(
      readFileSync(TS_GENERATED, "utf8"),
      fresh.ts,
      "device-settings.gen.ts basi — jalankan `npm run booth:contracts`"
    );
    assert.equal(
      readFileSync(CS_GENERATED, "utf8"),
      fresh.cs,
      "DeviceSettings.g.cs basi — jalankan `npm run booth:contracts`"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Semua literal string di dalam potongan teks C#. */
function quoted(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"/g)].map((entry) => entry[1] ?? "");
}

/** Ambil literal array string C#: `new string[] { "a", "b" }`. */
function csStringArray(source: string, field: string): string[] {
  const match = new RegExp(`${field}\\s*=\\s*new string\\[\\]\\s*\\{([^}]*)\\}`).exec(source);
  assert.ok(match, `field C# ${field} tidak ditemukan`);
  return quoted(match[1] ?? "");
}

/** Ambil peta dictionary C#: `["group"] = new string[] { ... }`. */
function csDictionary(source: string, field: string): Record<string, string[]> {
  const start = source.indexOf(`IReadOnlyDictionary<string, string[]> ${field} = new Dictionary`);
  assert.ok(start >= 0, `dictionary C# ${field} tidak ditemukan`);
  const open = source.indexOf("{", source.indexOf("new Dictionary", start));
  const close = source.indexOf("\n    };", open);
  assert.ok(open >= 0 && close > open, `blok dictionary ${field} tidak utuh`);
  const block = source.slice(open, close);
  const result: Record<string, string[]> = {};
  for (const entry of block.matchAll(/\["([^"]+)"\]\s*=\s*new string\[\]\s*\{([^}]*)\}/g)) {
    const key = entry[1];
    const body = entry[2];
    if (!key || body === undefined) continue;
    result[key] = quoted(body);
  }
  return result;
}

const csSource = readFileSync(CS_GENERATED, "utf8");

test("grup C# ≡ grup schema", () => {
  assert.deepEqual(csStringArray(csSource, "Groups"), [...schema["x-snapyos-groups"]]);
  assert.deepEqual(csStringArray(csSource, "CloudSyncedGroups"), [
    ...schema["x-snapyos-cloud-synced-groups"],
  ]);
  assert.deepEqual(csStringArray(csSource, "LocalOnlyGroups"), [
    ...schema["x-snapyos-local-only-groups"],
  ]);
});

test("versi schema C# ≡ schema JSON", () => {
  const match = /public const int SchemaVersion = (\d+);/.exec(csSource);
  assert.ok(match, "SchemaVersion C# tidak ditemukan");
  assert.equal(Number(match[1]), schema["x-snapyos-schema-version"]);
});

test("field C# ≡ field schema (dua arah)", () => {
  const csFields = csDictionary(csSource, "Fields");
  assert.deepEqual(Object.keys(csFields).sort(), [...schema["x-snapyos-groups"]].sort());
  for (const group of schema["x-snapyos-groups"]) {
    assert.deepEqual(csFields[group], schemaGroupFields(group), `field ${group} berbeda di C#`);
  }
});

test("field cloud-owned C# ≡ schema", () => {
  const csOwned = csDictionary(csSource, "CloudOwnedFields");
  for (const group of schema["x-snapyos-groups"]) {
    assert.deepEqual(
      csOwned[group] ?? [],
      schema["x-snapyos-cloud-owned-fields"][group] ?? [],
      `cloud-owned ${group} berbeda di C#`
    );
  }
});

test("invarian C# ≡ invarian schema", () => {
  const start = csSource.indexOf("Invariants = new Dictionary");
  assert.ok(start >= 0, "Invariants C# tidak ditemukan");
  const close = csSource.indexOf("\n    };", start);
  const block = csSource.slice(start, close);
  const parsed: Record<string, { left: string; op: string; right: string }[]> = {};
  for (const entry of block.matchAll(
    /\["([^"]+)"\]\s*=\s*new SettingInvariant\[\]\s*\{([^}]*)\}/g
  )) {
    const key = entry[1];
    if (!key) continue;
    parsed[key] = [...(entry[2] ?? "").matchAll(/new\("([^"]*)",\s*"([^"]*)",\s*"([^"]*)"\)/g)].map(
      (m) => ({ left: m[1] ?? "", op: m[2] ?? "", right: m[3] ?? "" })
    );
  }
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(SETTING_INVARIANTS)));
});

test("record C# memuat seluruh field grup", () => {
  for (const group of schema["x-snapyos-groups"]) {
    const recordName = group
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    const start = csSource.indexOf(`public sealed record ${recordName}`);
    assert.ok(start >= 0, `record ${recordName} tidak ada`);
    const block = csSource.slice(start, csSource.indexOf("\n}", start));
    for (const field of schemaGroupFields(group)) {
      assert.ok(
        block.includes(`[JsonPropertyName("${field}")]`),
        `${recordName} kehilangan field ${field}`
      );
    }
  }
});
