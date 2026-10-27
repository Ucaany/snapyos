import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import { createDigicamControlCamera } from "../runtime/camera/digicamcontrol.ts";
import { createMockCamera } from "../runtime/camera/mock.ts";
import { isJpeg } from "../runtime/camera/types.ts";
import { loadConfig } from "../runtime/config.ts";

const TOKEN = "test-bridge-token-0123456789";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

/** JPEG minimal yang lolos `isJpeg`: SOI + payload + EOI. */
const jpeg = Buffer.from([0xff, 0xd8, 0x46, 0x41, 0x4b, 0x45, 0xff, 0xd9]);

test("mock camera menghasilkan JPEG utuh dan berlabel", async () => {
  const camera = createMockCamera();
  const status = await camera.status();
  assert.equal(status.mock, true);
  assert.equal(status.connected, true);

  const first = await camera.capture();
  assert.ok(isJpeg(first));
  assert.ok(first.length > 1_000, "frame mock harus berupa gambar nyata, bukan stub");

  const preview = await camera.preview();
  assert.ok(isJpeg(preview));
});

test("mock camera: capture konkuren menghasilkan frame berbeda, tidak berbagi buffer", async () => {
  const camera = createMockCamera();
  const frames = await Promise.all([camera.capture(), camera.capture(), camera.capture()]);
  assert.equal(frames.length, 3);
  for (const frame of frames) assert.ok(isJpeg(frame));
  // Setiap capture bernomor sendiri — dua panggilan tidak boleh berbagi buffer.
  const digests = new Set(frames.map((frame) => frame.toString("base64")));
  assert.equal(digests.size, 3);
});

test("digiCamControl: capture lewat HTTP server, preview gagal tidak membatalkan capture", async () => {
  const port = await freePort();
  const calls: string[] = [];
  const server: Server = createServer((req, res) => {
    calls.push(String(req.url));
    if (req.url === "/") {
      res.statusCode = 200;
      res.end("<html>digiCamControl</html>");
      return;
    }
    if (req.url === "/?SLC=CaptureNoAf") {
      res.statusCode = 200;
      res.end("ok");
      return;
    }
    if (req.url === "/?SLC=Get&param1=lastcaptured") {
      res.statusCode = 200;
      res.end("DSC_0001.jpg");
      return;
    }
    if (req.url === "/thumb/large/DSC_0001.jpg") {
      res.statusCode = 200;
      res.setHeader("content-type", "image/jpeg");
      res.end(jpeg);
      return;
    }
    // Live view sengaja dibuat gagal: kamera bisa capture walau preview mati.
    res.statusCode = 503;
    res.end("no live view");
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  try {
    const config = loadConfig({
      PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
      SNAPYOS_CAMERA: "digicamcontrol",
      DIGICAMCONTROL_PORT: String(port),
      DIGICAMCONTROL_CMD: "/bin/false",
    });
    const camera = createDigicamControlCamera(config);

    const status = await camera.status();
    assert.equal(status.connected, true);
    assert.equal(status.adapter, "digicamcontrol");

    const captured = await camera.capture();
    assert.ok(isJpeg(captured));
    assert.ok(calls.includes("/?SLC=CaptureNoAf"));

    await assert.rejects(() => camera.preview(), /live view|503/i);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("digiCamControl: tanpa server HTTP, error operator menyebut kedua jalur", async () => {
  const port = await freePort();
  const config = loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
    SNAPYOS_CAMERA: "digicamcontrol",
    DIGICAMCONTROL_PORT: String(port),
    DIGICAMCONTROL_CMD: "/nonexistent/CameraControlCmd.exe",
    GPHOTO2_TIMEOUT_MS: "5000",
  });
  const camera = createDigicamControlCamera(config);

  const status = await camera.status();
  assert.equal(status.connected, false);
  assert.match(String(status.last_error), new RegExp(String(port)));

  await assert.rejects(() => camera.capture(), /CameraControlCmd|digiCamControl/);
});
