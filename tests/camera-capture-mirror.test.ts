/**
 * Camera capture — mirror flip pada piksel. docs/05 §5.5.
 *
 * Regresi: `mirror_preview` sebelumnya hanya mengubah elemen <video> (CSS
 * scaleX) dan TIDAK diterapkan ke hasil capture — hasil foto mengikuti
 * orientasi native kamera (selfie sering native-mirror), sehingga tidak
 * konsisten dengan toggle owner. drawVideoFrame kini mem-flip piksel.
 *
 * Run: npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { drawVideoFrame, type Frame2DContext } from "../src/lib/camera-capture.ts"

/** Rekam urutan operasi pada konteks 2D tiruan. */
function fakeCtx() {
  const calls: string[] = []
  const ctx: Frame2DContext = {
    translate: (x, y) => calls.push(`translate(${x},${y})`),
    scale: (x, y) => calls.push(`scale(${x},${y})`),
    drawImage: (_img, dx, dy, dw, dh) => calls.push(`drawImage(${dx},${dy},${dw},${dh})`),
  }
  return { ctx, calls }
}

test("drawVideoFrame: mirror=false → gambar apa adanya, tanpa transform", () => {
  const { ctx, calls } = fakeCtx()
  drawVideoFrame(ctx, {} as CanvasImageSource, 1920, 1080, false)
  assert.deepEqual(calls, ["drawImage(0,0,1920,1080)"])
})

test("drawVideoFrame: mirror=true → translate(w,0) + scale(-1,1) sebelum draw", () => {
  const { ctx, calls } = fakeCtx()
  drawVideoFrame(ctx, {} as CanvasImageSource, 1920, 1080, true)
  assert.deepEqual(calls, [
    "translate(1920,0)",
    "scale(-1,1)",
    "drawImage(0,0,1920,1080)",
  ])
})

test("drawVideoFrame: mirror flip menggunakan lebar frame (bukan tinggi)", () => {
  const { ctx, calls } = fakeCtx()
  drawVideoFrame(ctx, {} as CanvasImageSource, 640, 480, true)
  assert.equal(calls[0], "translate(640,0)")
})
