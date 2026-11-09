import type { InstallerMetadataInput } from "./validators";

export type InstallerCompatibilityInput = Pick<InstallerMetadataInput, "min_windows_version" | "architecture"> & {
  windows: "10" | "11";
  requestedArchitecture: "x64" | "x86" | "arm64" | "universal";
};

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isInstallerCompatible(input: InstallerCompatibilityInput): boolean {
  const windowsOk = input.windows === input.min_windows_version ||
    (input.windows === "11" && input.min_windows_version === "10");
  const architectureOk = input.architecture === "universal" || input.architecture === input.requestedArchitecture;
  return windowsOk && architectureOk;
}

export function isPublishedInstaller(row: { is_active: boolean; is_deprecated: boolean; published_at: string | null }) {
  return row.is_active && !row.is_deprecated && row.published_at !== null;
}
