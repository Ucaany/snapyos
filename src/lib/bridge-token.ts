/**
 * Token bridge lokal (kamera gphoto2 + CUPS).
 *
 * Bridge menguasai kamera dan printer fisik, jadi setiap rute selain `/health`
 * mewajibkan `X-Bridge-Token`. Token hidup di perangkat kiosk (localStorage),
 * bukan di konfigurasi cloud: `camera_settings`/`print_settings` dibaca browser
 * siapa pun yang membuka halaman booth, sehingga token di sana bukan rahasia.
 */
const BRIDGE_TOKEN_KEY = "snapyos_bridge_token";

export function getBridgeToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(BRIDGE_TOKEN_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setBridgeToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const value = token.trim();
    if (value) window.localStorage.setItem(BRIDGE_TOKEN_KEY, value);
    else window.localStorage.removeItem(BRIDGE_TOKEN_KEY);
  } catch {
    // Storage penuh/diblokir: bridge akan menolak, pesannya jelas di UI.
  }
}

/** Header tambahan untuk setiap panggilan bridge. Kosong bila token belum diisi. */
export function bridgeHeaders(): Record<string, string> {
  const token = getBridgeToken();
  return token ? { "X-Bridge-Token": token } : {};
}
