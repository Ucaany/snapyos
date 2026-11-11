/**
 * Deteksi kamera read-only: parse output `v4l2-ctl`, `--list-cameras`,
 * `gphoto2 --auto-detect`, dan perilaku klien saat bridge mati.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { listBridgeCameras } from "../src/lib/camera-provider.ts";
import { parseGphoto2Cameras } from "../runtime/camera/gphoto2.ts";
import { parseLibcameraCameras } from "../runtime/camera/libcamera.ts";
import { parseV4l2Devices } from "../runtime/camera/v4l2.ts";

const V4L2_OUTPUT = `Integrated Camera (usb-0000:00:14.0-1):
\t/dev/video0
\t/dev/video1

DNP DS620 (usb-0000:00:14.0-2):
\t/dev/video2
`;

const LIBCAMERA_OUTPUT = `Available cameras
-----------------
0 : imx219 [3280x2464 10-bit RGGB] (/base/soc/i2c0mux/i2c@1/imx219@10)
    Modes: 'SRGGB10_CSI2P' : 3280x2464 [21.19 fps]
`;

const GPHOTO_OUTPUT = `Model                          Port
----------------------------------------------------------
Canon EOS 2000D (a.k.a. Rebel T7) usb:001,004
`;

test("parse v4l2-ctl --list-devices: satu entri per /dev/videoN", () => {
  assert.deepEqual(parseV4l2Devices(V4L2_OUTPUT), [
    { id: "/dev/video0", label: "Integrated Camera (usb-0000:00:14.0-1) (/dev/video0)" },
    { id: "/dev/video1", label: "Integrated Camera (usb-0000:00:14.0-1) (/dev/video1)" },
    { id: "/dev/video2", label: "DNP DS620 (usb-0000:00:14.0-2) (/dev/video2)" },
  ]);
});

test("parse v4l2-ctl: tanpa perangkat = kosong", () => {
  assert.deepEqual(parseV4l2Devices(""), []);
});

test("parse --list-cameras: index jadi id stabil", () => {
  assert.deepEqual(parseLibcameraCameras(LIBCAMERA_OUTPUT), [
    {
      id: "0",
      label: "imx219 (/base/soc/i2c0mux/i2c@1/imx219@10)",
    },
  ]);
});

test("parse --list-cameras: 'No cameras available!' = kosong", () => {
  assert.deepEqual(parseLibcameraCameras("No cameras available!\n"), []);
});

test("parse gphoto2 --auto-detect: header dan garis dibuang", () => {
  assert.deepEqual(parseGphoto2Cameras(GPHOTO_OUTPUT), [
    {
      id: "usb:001,004",
      label: "Canon EOS 2000D (a.k.a. Rebel T7) (usb:001,004)",
    },
  ]);
});

test("parse gphoto2: hanya header = kosong", () => {
  assert.deepEqual(parseGphoto2Cameras("Model Port\n----------\n"), []);
});

async function withFetch(stub: () => Promise<Response>, task: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub as typeof fetch;
  try {
    await task();
  } finally {
    globalThis.fetch = original;
  }
}

test("klien: bridge mati mengembalikan {ok:false,reason} tanpa throw", async () => {
  await withFetch(
    () => Promise.reject(new TypeError("fetch failed")),
    async () => {
      const result = await listBridgeCameras({ provider: "bridge" });
      assert.equal(result.ok, false);
      assert.match(result.ok === false ? result.reason : "", /tidak aktif/);
    }
  );
});

test("klien: bridge melaporkan gagal deteksi diteruskan apa adanya", async () => {
  await withFetch(
    async () =>
      new Response(
        JSON.stringify({ ok: false, cameras: [], reason: "v4l2-ctl belum terpasang." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
    async () => {
      const result = await listBridgeCameras(null);
      assert.deepEqual(result, { ok: false, reason: "v4l2-ctl belum terpasang." });
    }
  );
});

test("klien: respons sukses dinormalisasi (label kosong -> id)", async () => {
  await withFetch(
    async () =>
      new Response(
        JSON.stringify({
          ok: true,
          cameras: [{ id: "/dev/video0", label: "Cam 0" }, { id: "/dev/video1" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
    async () => {
      const result = await listBridgeCameras(null);
      assert.deepEqual(result, {
        ok: true,
        cameras: [
          { id: "/dev/video0", label: "Cam 0" },
          { id: "/dev/video1", label: "/dev/video1" },
        ],
      });
    }
  );
});
