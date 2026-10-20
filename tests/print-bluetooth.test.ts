/**
 * Transport Web Bluetooth — kontrak link, chunking, dan error path.
 *
 * `connectEscPos` hanya menyentuh DOM lewat objek device yang diberikan, jadi
 * bisa diuji di node dengan device palsu (tanpa Web Bluetooth asli).
 * Untuk verifikasi printer fisik, lihat `kiosk-print-bluetooth-real.spec.mjs`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLE_CHUNK_DEFAULT,
  BluetoothPrintError,
  ESCPOS_SERVICES,
  connectEscPos,
} from "../src/lib/print/bluetooth.ts";

type FakeOptions = {
  writable?: boolean;
  writeFails?: boolean;
  noCharacteristic?: boolean;
  onWrite?: () => void;
};

function fakeDevice({
  writable = true,
  writeFails = false,
  noCharacteristic = false,
  onWrite,
}: FakeOptions = {}) {
  const listeners = new Map<string, Array<() => void>>();
  const writes: number[][] = [];
  const characteristic = {
    uuid: "00002af1-0000-1000-8000-00805f9b34fb",
    properties: { write: true, writeWithoutResponse: writable },
    async writeValue(value: ArrayBufferView) {
      if (writeFails) throw new Error("write failed");
      writes.push(Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)));
      onWrite?.();
    },
    async writeValueWithoutResponse(value: ArrayBufferView) {
      return this.writeValue(value);
    },
  };
  const service = {
    uuid: ESCPOS_SERVICES[0],
    async getCharacteristics() {
      return noCharacteristic ? [{ ...characteristic, properties: {} }] : [characteristic];
    },
  };
  const gatt = {
    connected: false,
    async connect() {
      this.connected = true;
      return this;
    },
    disconnect() {
      this.connected = false;
      for (const handler of listeners.get("gattserverdisconnected") ?? []) handler();
    },
    async getPrimaryServices() {
      return [service];
    },
  };
  const device = {
    id: "fake",
    name: "FAKE",
    gatt,
    addEventListener(type: string, handler: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener(type: string, handler: () => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== handler)
      );
    },
  };
  return { device: device as unknown as BluetoothDevice, writes, gatt };
}

test("chunk default 20 byte (batas aman Web Bluetooth)", () => {
  assert.equal(BLE_CHUNK_DEFAULT, 20);
});

test("write memecah byte per 20 dan urutannya identik", async () => {
  const { device, writes } = fakeDevice();
  const link = await connectEscPos(device);
  const bytes = Uint8Array.from({ length: 45 }, (_, i) => i + 1);
  await link.write(bytes);
  assert.deepEqual(
    writes.map((chunk) => chunk.length),
    [20, 20, 5]
  );
  assert.deepEqual(writes.flat(), Array.from(bytes));
});

test("write memakai writeValue saat writeWithoutResponse tidak ada", async () => {
  const { device, writes } = fakeDevice({ writable: false });
  const link = await connectEscPos(device);
  assert.equal(link.supportsNoResponse, false);
  await link.write(Uint8Array.from([1, 2, 3]));
  assert.deepEqual(writes, [[1, 2, 3]]);
});

test("printer tanpa karakteristik write ditolak dengan pesan dialog sistem", async () => {
  const { device } = fakeDevice({ noCharacteristic: true });
  await assert.rejects(
    () => connectEscPos(device),
    (error) => {
      assert.ok(error instanceof BluetoothPrintError);
      assert.equal(error.code, "NO_WRITABLE_CHARACTERISTIC");
      assert.match(error.message, /dialog cetak sistem/i);
      return true;
    }
  );
});

test("koneksi putus di tengah job menghentikan write berikutnya", async () => {
  let disconnect = () => undefined as void;
  const { device, gatt } = fakeDevice({
    onWrite: () => {
      disconnect();
      disconnect = () => undefined;
    },
  });
  disconnect = () => gatt.disconnect();
  const link = await connectEscPos(device);
  await assert.rejects(
    () =>
      link.write(
        Uint8Array.from({ length: 10 }, (_, i) => i),
        { chunkSize: 1 }
      ),
    (error) => error instanceof BluetoothPrintError && error.code === "DISCONNECTED"
  );
});

test("abort signal menghentikan job sebelum chunk berikutnya", async () => {
  const { device } = fakeDevice();
  const link = await connectEscPos(device);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => link.write(Uint8Array.from([1, 2, 3]), { signal: controller.signal }),
    (error) => error instanceof BluetoothPrintError && error.code === "ABORTED"
  );
});

test("gagal tulis dilaporkan sebagai WRITE_FAILED", async () => {
  const { device } = fakeDevice({ writeFails: true });
  const link = await connectEscPos(device);
  await assert.rejects(
    () => link.write(Uint8Array.from([1])),
    (error) => error instanceof BluetoothPrintError && error.code === "WRITE_FAILED"
  );
});
