declare module "gifenc" {
  export type GifPalette = number[][];

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: string; clearAlpha?: boolean; oneBitAlpha?: boolean; useSqrt?: boolean }
  ): GifPalette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: string
  ): Uint8Array;

  export type GifEncoder = {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        transparent?: boolean;
        transparentIndex?: number;
        delay?: number;
        palette?: GifPalette | null;
        repeat?: number;
        colorDepth?: number;
        dispose?: number;
      }
    ): void;
  };

  export function GIFEncoder(opt?: { initialCapacity?: number; auto?: boolean }): GifEncoder;
}
