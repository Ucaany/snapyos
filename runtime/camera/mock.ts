/**
 * Kamera palsu untuk tes dan demo. Setiap frame diberi label MOCK CAMERA di
 * dalam gambarnya: foto mock yang sampai ke pelanggan tanpa label adalah
 * kegagalan produk, bukan sekadar bug.
 */

import type { CameraAdapter, CameraStatus } from "./types.ts";

export function createMockCamera(): CameraAdapter {
  let counter = 0;

  async function frame(label: string): Promise<Buffer> {
    // sharp dimuat saat dipakai: jalur produksi (kamera fisik) tidak perlu
    // membayar native binding-nya saat start.
    const { default: sharp } = await import("sharp");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960">
      <rect width="100%" height="100%" fill="#111111"/>
      <rect x="40" y="40" width="1200" height="880" fill="none" stroke="#ffffff" stroke-width="4"/>
      <text x="640" y="450" fill="#ffffff" font-family="sans-serif" font-size="72"
        text-anchor="middle">MOCK CAMERA</text>
      <text x="640" y="530" fill="#ffffff" font-family="sans-serif" font-size="32"
        text-anchor="middle">${label}</text>
    </svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  }

  return {
    kind: "mock",
    mock: true,

    async status(): Promise<CameraStatus> {
      return { adapter: "mock", connected: true, mock: true, model: "mock" };
    },

    async preview(): Promise<Buffer> {
      return frame("preview");
    },

    async capture(): Promise<Buffer> {
      counter += 1;
      return frame(`capture #${counter}`);
    },
  };
}
