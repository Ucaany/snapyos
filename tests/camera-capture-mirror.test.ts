/**
 * Camera capture — mirror + kalibrasi rotasi/zoom. docs/05 §5.5.
 *
 * Regresi yang dijaga:
 * - `mirror_preview` dulu hanya mengubah elemen <video> (CSS scaleX) dan TIDAK
 *   diterapkan ke hasil capture.
 * - `rotation_degrees` dan `zoom` disimpan form tetapi tidak pernah dipakai.
 *
 * Run: npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  captureSize,
  drawVideoFrame,
  normalizeRotation,
  normalizeZoom,
  type Frame2DContext,
} from "../src/lib/camera-capture.ts"

/** Rekam urutan operasi pada konteks 2D tiruan. */
function fakeCtx() {
  const calls: string[] = []
  const ctx: Frame2DContext = {
    translate: (x, y) => calls.push(`translate(${x},${y})`),
    scale: (x, y) => calls.push(`scale(${x},${y})`),
    rotate: (angle) => calls.push(`rotate(${angle.toFixed(4)})`),
    drawImage: (_img, dx, dy, dw, dh) => calls.push(`drawImage(${dx},${dy},${dw},${dh})`),
  }
  return { ctx, calls }
}

test("drawVideoFrame: tanpa transform = translate tengah lalu draw sumber", () => {
  const { ctx, calls } = fakeCtx()
  drawVideoFrame(ctx, {} as CanvasImageSource, 1920, 1080, false)
  assert.deepEqual(calls, [
    "translate(960,540)",
    "translate(-960,-540)",
    "drawImage(0,0,1920,1080)",
  ])
})

test("drawVideoFrame: mirror=true membalik skala X", () => {
  const { ctx, calls } = fakeCtx()
  drawVideoFrame(ctx, {} as CanvasImageSource, 1920, 1080, true)
  assert.deepEqual(calls, [
    "translate(960,540)",
    "scale(-1,1)",
    "translate(-960,-540)",
    "drawImage(0,0,1920,1080)",
  ])
})

test("drawVideoFrame: rotasi 90 memutar di tengah dan menggambar sumber w×h", () => {
  const { ctx, calls } = fakeCtx()
  drawVideoFrame(ctx, {} as CanvasImageSource, 640, 480, false, 90)
  assert.deepEqual(calls, [
    // Kanvas hasil rotasi = 480x640, jadi pusatnya (240,320).
    "translate(240,320)",
    "rotate(1.5708)",
    "translate(-320,-240)",
    "drawImage(0,0,640,480)",
  ])
})

test("drawVideoFrame: zoom>1 menambahkan scale setelah mirror", () => {
  const { ctx, calls } = fakeCtx()
  drawVideoFrame(ctx, {} as CanvasImageSource, 800, 600, true, 0, 2)
  assert.deepEqual(calls.slice(1, 4), ["scale(-1,1)", "scale(2,2)", "translate(-400,-300)"])
})

test("normalizeRotation membulatkan ke 0/90/180/270", () => {
  assert.equal(normalizeRotation(undefined), 0)
  assert.equal(normalizeRotation(90), 90)
  assert.equal(normalizeRotation(88), 90)
  assert.equal(normalizeRotation(270), 270)
  assert.equal(normalizeRotation(360), 0)
  assert.equal(normalizeRotation(-90), 270)
  assert.equal(normalizeRotation(45), 90)
})

test("normalizeZoom menjepit 1..5", () => {
  assert.equal(normalizeZoom(undefined), 1)
  assert.equal(normalizeZoom(0.4), 1)
  assert.equal(normalizeZoom(2.5), 2.5)
  assert.equal(normalizeZoom(9), 5)
})

test("captureSize menukar dimensi hanya untuk 90/270", () => {
  assert.deepEqual(captureSize(640, 480, 0), { width: 640, height: 480 })
  assert.deepEqual(captureSize(640, 480, 90), { width: 480, height: 640 })
  assert.deepEqual(captureSize(640, 480, 180), { width: 640, height: 480 })
  assert.deepEqual(captureSize(640, 480, 270), { width: 480, height: 640 })
})
