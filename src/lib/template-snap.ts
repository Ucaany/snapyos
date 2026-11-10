/**
 * Snap geometry builder template — MURNI (tanpa DOM) agar bisa diuji langsung.
 * Target snap: tepi + tengah kanvas, dan tepi + tengah slot lain.
 */

export type SnapAxis = "x" | "y";
export type SnapGuide = { axis: SnapAxis; position: number };

export type SnapRect = { x: number; y: number; width: number; height: number };

export type SnapResult = { x: number; y: number; guides: SnapGuide[] };

const DEFAULT_THRESHOLD = 8;

/** Selisih terkecil antara tiga titik rect dan satu titik kandidat. */
function bestDelta(
  targets: readonly number[],
  candidates: readonly number[]
): { delta: number; position: number } | null {
  let best: { delta: number; position: number } | null = null;
  for (const candidate of candidates) {
    for (const target of targets) {
      const delta = target - candidate;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, position: target };
      }
    }
  }
  return best;
}

/**
 * Snap posisi rect yang digeser. Hanya translasi: ukuran tidak berubah.
 * `others` = slot lain (tanpa slot yang sedang digeser).
 */
export function snapRect(
  rect: SnapRect,
  others: readonly SnapRect[],
  canvas: { width: number; height: number },
  threshold = DEFAULT_THRESHOLD
): SnapResult {
  const xTargets = [0, canvas.width / 2, canvas.width];
  const yTargets = [0, canvas.height / 2, canvas.height];
  for (const other of others) {
    xTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
    yTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
  }

  const xCandidates = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  const yCandidates = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];

  const xSnap = bestDelta(xTargets, xCandidates);
  const ySnap = bestDelta(yTargets, yCandidates);

  const guides: SnapGuide[] = [];
  let x = rect.x;
  let y = rect.y;
  if (xSnap && Math.abs(xSnap.delta) <= threshold) {
    x = rect.x + xSnap.delta;
    guides.push({ axis: "x", position: xSnap.position });
  }
  if (ySnap && Math.abs(ySnap.delta) <= threshold) {
    y = rect.y + ySnap.delta;
    guides.push({ axis: "y", position: ySnap.position });
  }
  return { x, y, guides };
}
