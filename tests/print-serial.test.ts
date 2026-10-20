/**
 * Transport Web Serial untuk printer SPP — retry open, chunking, cleanup.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SERIAL_CHUNK_DEFAULT,
  SerialPrintError,
  openSerialPort,
  writeEscPosSerial,
  type SerialLike,
  type SerialPortLike,
} from "../src/lib/print/serial.ts";

type FakePortOptions = {
  openFailures?: number;
  writeFailures?: number;
  writable?: boolean;
};

function fakePort({ openFailures = 0, writeFailures = 0, writable = true }: FakePortOptions = {}) {
  const writes: number[][] = [];
  let opens = 0;
  let closes = 0;
  let openAttempts = 0;
  const port: SerialPortLike = {
    getInfo: () => ({ bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb" }),
    async open() {
      openAttempts += 1;
      if (openAttempts <= openFailures) throw new DOMException("busy", "NetworkError");
      opens += 1;
    },
    async close() {
      closes += 1;
    },
    get writable() {
      if (!writable) return null;
      return new WritableStream<Uint8Array>({
        write(chunk) {
          if (writes.length < writeFailures) throw new Error("write failed");
          writes.push(Array.from(chunk));
        },
      });
    },
  };
  return {
    port,
    writes,
    get opens() {
      return opens;
    },
    get closes() {
      return closes;
    },
    get openAttempts() {
      return openAttempts;
    },
  };
}

function fakeSerial(port: SerialPortLike, requestError?: Error): SerialLike {
  return {
    async requestPort() {
      if (requestError) throw requestError;
      return port;
    },
    async getPorts() {
      return [port];
    },
  };
}

const noSleep = async () => {};

test("chunk default 512 byte untuk serial", () => {
  assert.equal(SERIAL_CHUNK_DEFAULT, 512);
});

test("job serial dipecah per chunk dan byte identik", async () => {
  const fake = fakePort();
  const bytes = Uint8Array.from({ length: 1300 }, (_, i) => i % 251);
  await writeEscPosSerial(bytes, {
    serial: fakeSerial(fake.port),
    sleep: noSleep,
    chunkSize: 512,
  });
  assert.deepEqual(
    fake.writes.map((chunk) => chunk.length),
    [512, 512, 276]
  );
  assert.deepEqual(fake.writes.flat(), Array.from(bytes));
  assert.equal(fake.closes, 1);
});

test("open diulang saat printer SPP menolak percobaan pertama", async () => {
  const fake = fakePort({ openFailures: 1 });
  await writeEscPosSerial(Uint8Array.from([1, 2, 3]), {
    serial: fakeSerial(fake.port),
    sleep: noSleep,
    openRetries: 4,
  });
  assert.equal(fake.openAttempts, 2);
  assert.deepEqual(fake.writes, [[1, 2, 3]]);
  assert.equal(fake.closes, 1);
});

test("open gagal total → OPEN_FAILED dan port tetap ditutup", async () => {
  const fake = fakePort({ openFailures: 9 });
  await assert.rejects(
    () =>
      writeEscPosSerial(Uint8Array.from([1]), {
        serial: fakeSerial(fake.port),
        sleep: noSleep,
        openRetries: 3,
      }),
    (error) =>
      error instanceof SerialPrintError &&
      error.code === "OPEN_FAILED" &&
      /menyala|di-pair/i.test(error.message)
  );
  assert.equal(fake.openAttempts, 3);
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.closes, 1);
});

test("batal memilih port → NO_PORT tanpa error mentah", async () => {
  const fake = fakePort();
  await assert.rejects(
    () =>
      writeEscPosSerial(Uint8Array.from([1]), {
        serial: fakeSerial(fake.port, new DOMException("cancelled", "NotFoundError")),
        sleep: noSleep,
      }),
    (error) =>
      error instanceof SerialPrintError &&
      error.code === "NO_PORT" &&
      /Tidak ada printer dipilih/.test(error.message)
  );
});

test("write gagal → WRITE_FAILED, writer dilepas, port ditutup", async () => {
  const fake = fakePort({ writeFailures: 1 });
  await assert.rejects(
    () =>
      writeEscPosSerial(Uint8Array.from([1, 2, 3]), {
        serial: fakeSerial(fake.port),
        sleep: noSleep,
      }),
    (error) => error instanceof SerialPrintError && error.code === "WRITE_FAILED"
  );
  assert.equal(fake.closes, 1);
});

test("abort sebelum tulis tidak membuka port", async () => {
  const fake = fakePort();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      writeEscPosSerial(Uint8Array.from([1]), {
        serial: fakeSerial(fake.port),
        signal: controller.signal,
      }),
    (error) => error instanceof SerialPrintError && error.code === "ABORTED"
  );
  assert.equal(fake.openAttempts, 0);
});

test("abort di tengah chunk menghentikan sisa job", async () => {
  const fake = fakePort();
  const controller = new AbortController();
  await assert.rejects(
    () =>
      writeEscPosSerial(
        Uint8Array.from({ length: 1200 }, () => 7),
        {
          serial: fakeSerial(fake.port),
          signal: controller.signal,
          sleep: async () => controller.abort(),
          chunkSize: 512,
        }
      ),
    (error) => error instanceof SerialPrintError && error.code === "ABORTED"
  );
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.closes, 1);
});

test("port tanpa writable ditolak sebagai WRITE_FAILED", async () => {
  const fake = fakePort({ writable: false });
  await assert.rejects(
    () =>
      writeEscPosSerial(Uint8Array.from([1]), {
        serial: fakeSerial(fake.port),
        sleep: noSleep,
      }),
    (error) => error instanceof SerialPrintError && error.code === "WRITE_FAILED"
  );
  assert.equal(fake.closes, 1);
});

test("tanpa navigator.serial → UNSUPPORTED", async () => {
  await assert.rejects(
    () => writeEscPosSerial(Uint8Array.from([1]), { serial: null, sleep: noSleep }),
    (error) => error instanceof SerialPrintError && error.code === "UNSUPPORTED"
  );
});

test("openSerialPort meneruskan baud rate pilihan owner", async () => {
  let seen = 0;
  const port: SerialPortLike = {
    getInfo: () => ({}),
    async open(options) {
      seen = options.baudRate;
    },
    async close() {},
    writable: new WritableStream<Uint8Array>(),
  };
  await openSerialPort(port, { baudRate: 115200, sleep: noSleep });
  assert.equal(seen, 115200);
});
