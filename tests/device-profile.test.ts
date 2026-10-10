import assert from "node:assert/strict"
import test from "node:test"

function stubEnv(userAgent: string, maxTouchPoints: number, standalone = false, width = 1280, height = 800) {
  const g = globalThis as Record<string, unknown>
  const navDesc = Object.getOwnPropertyDescriptor(g, "navigator")
  const screenDesc = Object.getOwnPropertyDescriptor(g, "screen")
  const matchDesc = Object.getOwnPropertyDescriptor(g, "matchMedia")

  Object.defineProperty(g, "navigator", {
    configurable: true,
    value: { userAgent, maxTouchPoints, standalone } as unknown as Navigator,
  })
  Object.defineProperty(g, "screen", {
    configurable: true,
    value: { width, height },
  })
  const matchMediaFn = () => ({ matches: standalone } as MediaQueryList)
  Object.defineProperty(g, "matchMedia", {
    configurable: true,
    value: matchMediaFn,
  })
  // window.matchMedia dipakai isPwaInstalled — stub window bila belum ada.
  const winDesc = Object.getOwnPropertyDescriptor(g, "window")
  const winVal = (g.window as Record<string, unknown>) ?? {}
  const origWinMatch = winVal.matchMedia
  winVal.matchMedia = matchMediaFn
  Object.defineProperty(g, "window", { configurable: true, value: winVal })

  return () => {
    if (navDesc) Object.defineProperty(g, "navigator", navDesc)
    else delete g.navigator
    if (screenDesc) Object.defineProperty(g, "screen", screenDesc)
    else delete g.screen
    if (matchDesc) Object.defineProperty(g, "matchMedia", matchDesc)
    else delete g.matchMedia
    if (winDesc) Object.defineProperty(g, "window", winDesc)
    else delete g.window
    if (origWinMatch === undefined) delete winVal.matchMedia
    else winVal.matchMedia = origWinMatch
  }
}

test("device profile: tablet Android → landscape, kamera belakang, fullscreen, print", async () => {
  const restore = stubEnv(
    "Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    5,
    false,
    1280
  )
  try {
    const mod = await import("../src/lib/device-profile.ts")
    const p = mod.getDeviceProfile()
    assert.equal(p.kind, "tablet-android")
    assert.equal(p.isTablet, true)
    assert.equal(p.isPhone, false)
    assert.equal(p.supportsFullscreen, true)
    assert.equal(p.supportsPrint, true)
    assert.equal(p.defaultOrientation, "landscape")
    assert.equal(p.defaultFacingMode, "environment")
  } finally {
    restore()
  }
})

test("device profile: Android phone → portrait, kamera depan, tanpa print", async () => {
  const restore = stubEnv(
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    5,
    false,
    412,
    915
  )
  try {
    const mod = await import("../src/lib/device-profile.ts")
    const p = mod.getDeviceProfile()
    assert.equal(p.kind, "phone-android")
    assert.equal(p.isPhone, true)
    assert.equal(p.supportsFullscreen, true)
    assert.equal(p.supportsPrint, false)
    assert.equal(p.defaultOrientation, "portrait")
    assert.equal(p.defaultFacingMode, "user")
  } finally {
    restore()
  }
})

test("device profile: iPad → tanpa fullscreen, print, landscape", async () => {
  const restore = stubEnv(
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    5,
    true,
    1024
  )
  try {
    const mod = await import("../src/lib/device-profile.ts")
    const p = mod.getDeviceProfile()
    assert.equal(p.kind, "ipad")
    assert.equal(p.isTablet, true)
    assert.equal(p.supportsFullscreen, false)
    assert.equal(p.supportsPrint, true)
    assert.equal(p.defaultOrientation, "landscape")
    assert.equal(p.defaultFacingMode, "environment")
    assert.equal(p.isPwaInstalled, true)
  } finally {
    restore()
  }
})

test("device profile: iPhone → tanpa fullscreen, tanpa print, portrait", async () => {
  const restore = stubEnv(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    5,
    true,
    390,
    844
  )
  try {
    const mod = await import("../src/lib/device-profile.ts")
    const p = mod.getDeviceProfile()
    assert.equal(p.kind, "phone-ios")
    assert.equal(p.isPhone, true)
    assert.equal(p.supportsFullscreen, false)
    assert.equal(p.supportsPrint, false)
    assert.equal(p.defaultOrientation, "portrait")
    assert.equal(p.defaultFacingMode, "user")
  } finally {
    restore()
  }
})

test("device profile: desktop → bukan sentuh, fullscreen (default true di desktop)", async () => {
  const restore = stubEnv(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    0,
    false,
    1920
  )
  try {
    const mod = await import("../src/lib/device-profile.ts")
    const p = mod.getDeviceProfile()
    assert.equal(p.kind, "desktop")
    assert.equal(p.isTouch, false)
  } finally {
    restore()
  }
})
