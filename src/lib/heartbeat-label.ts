/** Format heartbeat jadi label manusiawi. Murni, dipakai server + client. */
export function heartbeatLabel(iso: string | null, nowMs: number): string {
  if (!iso) return "Belum pernah";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Belum pernah";
  const diff = Math.floor((nowMs - t) / 1000);
  if (diff < 0) return "Baru saja";
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86_400)} hari lalu`;
}
