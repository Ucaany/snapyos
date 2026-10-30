/**
 * Generator kontrak setelan SnapyOS.
 *
 * Satu sumber: booth/contracts/device-settings.schema.json.
 * Keluaran (deterministik — jalankan ulang menghasilkan berkas byte-identik):
 *   - src/lib/generated/device-settings.gen.ts            (dipakai cloud + runtime TS)
 *   - booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs (dipakai aplikasi booth C#)
 *
 * Jalankan: node booth/contracts/generate.mjs
 *           node booth/contracts/generate.mjs --out-dir <dir>
 *
 * `--out-dir` menulis ke direktori lain dengan struktur path yang sama
 * (relatif terhadap root repo). Dipakai tes determinisme agar tidak menyentuh
 * berkas yang di-commit; perilaku default tidak berubah.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const TS_REL = join("src", "lib", "generated", "device-settings.gen.ts");
const CS_REL = join("booth", "src", "SnapyOS.Booth.Contracts", "DeviceSettings.g.cs");

function outDirFromArgs(argv) {
  const index = argv.indexOf("--out-dir");
  if (index === -1) return REPO_ROOT;
  const value = argv[index + 1];
  if (!value) throw new Error("--out-dir butuh nilai direktori.");
  return resolve(value);
}

const OUT_ROOT = outDirFromArgs(process.argv.slice(2));

const SCHEMA_PATH = join(HERE, "device-settings.schema.json");
const TS_OUT = join(OUT_ROOT, TS_REL);
const CS_OUT = join(OUT_ROOT, CS_REL);

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

const GROUPS = schema["x-snapyos-groups"];
const CLOUD_SYNCED = schema["x-snapyos-cloud-synced-groups"];
const LOCAL_ONLY = schema["x-snapyos-local-only-groups"];
const CLOUD_OWNED = schema["x-snapyos-cloud-owned-fields"];
const SCHEMA_VERSION = schema["x-snapyos-schema-version"];
const DEFS = schema.$defs ?? {};

// --- resolusi $ref lokal -----------------------------------------------------

function refName(ref) {
  return ref.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : null;
}

function deref(node) {
  if (node && typeof node === "object" && typeof node.$ref === "string") {
    const name = refName(node.$ref);
    if (!name || !DEFS[name]) throw new Error(`$ref tidak dikenal: ${node.$ref}`);
    return { name, node: DEFS[name] };
  }
  return { name: null, node };
}

function groupProperties(group) {
  const { node } = deref(schema.properties[group]);
  return Object.keys(node.properties ?? {});
}

// --- validasi schema ---------------------------------------------------------

function validate() {
  for (const group of GROUPS) {
    if (!schema.properties?.[group]) throw new Error(`Grup ${group} tidak ada di properties.`);
    const fields = groupProperties(group);
    for (const owned of CLOUD_OWNED[group] ?? []) {
      if (!fields.includes(owned)) {
        throw new Error(`Field cloud-owned ${group}.${owned} tidak ada di schema.`);
      }
    }
  }
  const union = [...CLOUD_SYNCED, ...LOCAL_ONLY].sort();
  if (union.join(",") !== [...GROUPS].sort().join(",")) {
    throw new Error("cloud-synced + local-only harus membentuk seluruh grup.");
  }
}

// --- TypeScript --------------------------------------------------------------

function tsLiteralUnion(values) {
  return values.map((v) => JSON.stringify(v)).join(" | ");
}

function tsType(node) {
  const { name, node: target } = deref(node);
  if (name && DEFS[name] && target.type === "object") return pascal(name);
  if (name && target.enum) return tsLiteralUnion(target.enum);
  if (name && (target.type === "string" || target.pattern)) return "string";

  if (Array.isArray(node.anyOf)) {
    return node.anyOf.map((branch) => tsType(branch)).join(" | ");
  }
  if (Array.isArray(node.type)) {
    return node.type.map((t) => tsType({ ...node, type: t })).join(" | ");
  }
  switch (node.type) {
    case "string":
      return node.enum ? tsLiteralUnion(node.enum) : "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return `Array<${tsType(node.items)}>`;
    case "object":
      if (node.properties) {
        const members = Object.entries(node.properties)
          .map(([key, value]) => `${JSON.stringify(key)}?: ${tsType(value)}`)
          .join("; ");
        return `{ ${members} }`;
      }
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}

function tsProperty(name, node) {
  const optional = "?";
  return `  ${JSON.stringify(name)}${optional}: ${tsType(node)};`;
}

function emitTsInterface(defName) {
  const node = DEFS[defName];
  const lines = [`export interface ${pascal(defName)} {`];
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    lines.push(tsProperty(key, value));
  }
  lines.push("}");
  return lines.join("\n");
}

function buildTs() {
  const blocks = [];
  blocks.push(
    "// AUTO-GENERATED — jangan diubah manual.",
    "// Sumber: booth/contracts/device-settings.schema.json",
    "// Regenerate: node booth/contracts/generate.mjs",
    ""
  );
  blocks.push(`export const SETTINGS_SCHEMA_VERSION = ${SCHEMA_VERSION};`);
  blocks.push("");
  blocks.push(
    `export const DEVICE_SETTING_GROUPS = [${GROUPS.map((g) => JSON.stringify(g)).join(", ")}] as const;`
  );
  blocks.push("export type DeviceSettingGroupName = (typeof DEVICE_SETTING_GROUPS)[number];");
  blocks.push("");
  blocks.push(
    `export const CLOUD_SYNCED_DEVICE_GROUPS = [${CLOUD_SYNCED.map((g) => JSON.stringify(g)).join(", ")}] as const;`
  );
  blocks.push(
    `export const LOCAL_ONLY_DEVICE_GROUPS = [${LOCAL_ONLY.map((g) => JSON.stringify(g)).join(", ")}] as const;`
  );
  blocks.push("");
  blocks.push(
    "export const CLOUD_OWNED_SETTING_FIELDS: Record<DeviceSettingGroupName, readonly string[]> = {"
  );
  for (const group of GROUPS) {
    const owned = CLOUD_OWNED[group] ?? [];
    blocks.push(`  ${group}: [${owned.map((f) => JSON.stringify(f)).join(", ")}],`);
  }
  blocks.push("};");
  blocks.push("");
  blocks.push(
    "export const DEVICE_SETTING_FIELDS: Record<DeviceSettingGroupName, readonly string[]> = {"
  );
  for (const group of GROUPS) {
    const fields = groupProperties(group);
    blocks.push(`  ${group}: [${fields.map((f) => JSON.stringify(f)).join(", ")}],`);
  }
  blocks.push("};");
  blocks.push("");
  for (const defName of Object.keys(DEFS)) {
    if (DEFS[defName].type === "object") blocks.push(emitTsInterface(defName), "");
  }
  blocks.push("export interface DeviceSettings {");
  for (const group of GROUPS) {
    blocks.push(`  ${JSON.stringify(group)}?: ${pascal(refName(schema.properties[group].$ref))};`);
  }
  blocks.push("}");
  return blocks.join("\n") + "\n";
}

// --- C# ----------------------------------------------------------------------

function pascal(snake) {
  return snake
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function csType(node) {
  const { name, node: target } = deref(node);
  if (name && DEFS[name] && target.type === "object") return `${pascal(name)}?`;
  if (name && target.enum && target.type === "string") return "string?";
  if (name && (target.type === "string" || target.pattern)) return "string?";

  if (Array.isArray(node.anyOf)) {
    const branch = node.anyOf.find((b) => deref(b).node.type !== "null") ?? node.anyOf[0];
    return csType(branch);
  }
  if (Array.isArray(node.type)) {
    const first = node.type.find((t) => t !== "null") ?? node.type[0];
    return csType({ ...node, type: first });
  }
  switch (node.type) {
    case "string":
      return "string?";
    case "integer":
      return "int?";
    case "number":
      return "double?";
    case "boolean":
      return "bool?";
    case "array":
      return `List<${(csType(node.items) ?? "string?").replace(/\?$/, "")}>?`;
    case "object":
      return "Dictionary<string, object>?";
    default:
      return "object?";
  }
}

function emitCsRecord(defName) {
  const node = DEFS[defName];
  const lines = [`public sealed record ${pascal(defName)}`, "{"];
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    lines.push(`    [JsonPropertyName(${JSON.stringify(key)})]`);
    lines.push(`    public ${csType(value)} ${pascal(key)} { get; init; }`);
  }
  lines.push("}");
  return lines.join("\n");
}

function csArray(values) {
  return `new string[] { ${values.map((v) => JSON.stringify(v)).join(", ")} }`;
}

function buildCs() {
  const blocks = [];
  blocks.push(
    "// <auto-generated />",
    "// Sumber: booth/contracts/device-settings.schema.json",
    "// Regenerate: node booth/contracts/generate.mjs",
    "#nullable enable",
    "",
    "using System.Collections.Generic;",
    "using System.Text.Json.Serialization;",
    "",
    "namespace SnapyOS.Booth.Contracts;",
    ""
  );
  blocks.push("public static class DeviceSettingsContract");
  blocks.push("{");
  blocks.push(`    public const int SchemaVersion = ${SCHEMA_VERSION};`);
  blocks.push(`    public static readonly string[] Groups = ${csArray(GROUPS)};`);
  blocks.push(`    public static readonly string[] CloudSyncedGroups = ${csArray(CLOUD_SYNCED)};`);
  blocks.push(`    public static readonly string[] LocalOnlyGroups = ${csArray(LOCAL_ONLY)};`);
  blocks.push("");
  blocks.push(
    "    public static readonly IReadOnlyDictionary<string, string[]> CloudOwnedFields = new Dictionary<string, string[]>"
  );
  blocks.push("    {");
  for (const group of GROUPS) {
    blocks.push(`        [${JSON.stringify(group)}] = ${csArray(CLOUD_OWNED[group] ?? [])},`);
  }
  blocks.push("    };");
  blocks.push("");
  blocks.push(
    "    public static readonly IReadOnlyDictionary<string, string[]> Fields = new Dictionary<string, string[]>"
  );
  blocks.push("    {");
  for (const group of GROUPS) {
    blocks.push(`        [${JSON.stringify(group)}] = ${csArray(groupProperties(group))},`);
  }
  blocks.push("    };");
  blocks.push("}");
  blocks.push("");
  for (const defName of Object.keys(DEFS)) {
    if (DEFS[defName].type === "object") blocks.push(emitCsRecord(defName), "");
  }
  blocks.push("public sealed record DeviceSettings");
  blocks.push("{");
  for (const group of GROUPS) {
    blocks.push(`    [JsonPropertyName(${JSON.stringify(group)})]`);
    blocks.push(
      `    public ${pascal(refName(schema.properties[group].$ref))}? ${pascal(group)} { get; init; }`
    );
  }
  blocks.push("}");
  return blocks.join("\n") + "\n";
}

function writeOut(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

validate();
const tsPath = writeOut(TS_OUT, buildTs());
const csPath = writeOut(CS_OUT, buildCs());

process.stdout.write(`generated:\n  ${tsPath}\n  ${csPath}\n`);
