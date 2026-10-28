/**
 * Transport Web Serial untuk printer thermal Bluetooth Classic (SPP).
 *
 * Web Bluetooth hanya menjangkau GATT/BLE. Banyak printer murah (mis.
 * RPPO2N) memakai profil SPP; setelah di-pair, Chrome desktop menampilkan
 * port itu di chooser Web Serial. Modul ini menulis ESC/POS ke port tersebut
 * tanpa backend atau driver tambahan.
 *
 * Catatan platform: Web Serial hanya Chrome/Edge desktop (bukan Android/iOS).
 * `requestPort()` wajib dipanggil dari gestur pengguna.
 */

export type SerialPortInfoLike = {
  usbVendorId?: number;
  usbProductId?: number;
  bluetoothServiceClassId?: string;
};

export type SerialPortLike = {
  getInfo(): SerialPortInfoLike;
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: "none" | "even" | "odd";
    flowControl?: "none" | "hardware";
    bufferSize?: number;
  }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
};

export type SerialLike = {
  requestPort(options?: {
    filters?: Array<{ bluetoothServiceClassId?: string }>;
  }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
};

export class SerialPrintError extends Error {
  code: "UNSUPPORTED" | "NO_PORT" | "OPEN_FAILED" | "WRITE_FAILED" | "ABORTED";
  constructor(code: SerialPrintError["code"], message: string) {
    super(message);
    this.name = "SerialPrintError";
    this.code = code;
  }
}

export const SERIAL_DEFAULT_BAUD = 9600;
/**
 * RPPO2N terukur: konsumsi nyata ±550 B/s (9600 baud, 8N1). Menulis lebih
 * cepat hanya menumpuk di buffer printer; buffer penuh membuat write berhenti
 * di ~8-16KB lalu link putus (job terpotong). Chunk 256 + jeda 480ms ≈ 525 B/s
 * terverifikasi mengirim job foto 10.431 byte utuh tanpa overflow.
 */
export const SERIAL_CHUNK_DEFAULT = 256;
export const SERIAL_OPEN_RETRIES = 4;
export const SERIAL_RETRY_DELAY_MS = 1200;
export const SERIAL_WRITE_GAP_MS = 480;
/** Batas tunggu per operasi port. Link SPP yang putus di tengah job bisa
 *  menggantung `open()`/`write()` tanpa pernah reject — tanpa batas ini UI
 *  berhenti di "Mengirim…" selamanya dan customer tidak bisa retry. */
export const SERIAL_OPEN_TIMEOUT_MS = 8_000;
export const SERIAL_WRITE_TIMEOUT_MS = 20_000;
export const SERIAL_CLOSE_TIMEOUT_MS = 4_000;

export function getSerialApi(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  const serial = (navigator as Navigator & { serial?: SerialLike }).serial;
  return serial && typeof serial.requestPort === "function" ? serial : null;
}

export function isSerialPrintSupported(): boolean {
  return getSerialApi() !== null;
}

export type SerialWriteOptions = {
  signal?: AbortSignal;
  baudRate?: number;
  chunkSize?: number;
  openRetries?: number;
  retryDelayMs?: number;
  writeGapMs?: number;
  openTimeoutMs?: number;
  writeTimeoutMs?: number;
  closeTimeoutMs?: number;
  serial?: SerialLike | null;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function abortError(): SerialPrintError {
  return new SerialPrintError("ABORTED", "Cetak dibatalkan.");
}

/** Batasi promise port yang bisa menggantung saat Bluetooth putus. */
function withTimeout<T>(promise: Promise<T>, ms: number, error: () => Error): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(error()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      }
    );
  });
}

function writeTimeoutError(): SerialPrintError {
  return new SerialPrintError(
    "WRITE_FAILED",
    "Printer berhenti merespons saat mencetak. Periksa koneksi Bluetooth, lalu cetak ulang."
  );
}

/** Buka port dengan retry; port SPP dapat menjawab NetworkError sekali. */
export async function openSerialPort(
  port: SerialPortLike,
  options: Omit<SerialWriteOptions, "signal" | "serial"> = {}
): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  const retries = Math.max(1, options.openRetries ?? SERIAL_OPEN_RETRIES);
  const baudRate = options.baudRate ?? SERIAL_DEFAULT_BAUD;
  const openTimeoutMs = options.openTimeoutMs ?? SERIAL_OPEN_TIMEOUT_MS;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await withTimeout(
        port.open({
          baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: "none",
          flowControl: "none",
        }),
        openTimeoutMs,
        () =>
          new SerialPrintError(
            "OPEN_FAILED",
            "Printer tidak merespons. Pastikan printer menyala dan Bluetooth tersambung."
          )
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(options.retryDelayMs ?? SERIAL_RETRY_DELAY_MS);
    }
  }
  throw new SerialPrintError(
    "OPEN_FAILED",
    lastError instanceof Error && lastError.name === "NetworkError"
      ? "Port printer tidak bisa dibuka. Pastikan printer menyala, sudah di-pair, lalu coba lagi."
      : "Port printer tidak bisa dibuka."
  );
}

/**
 * Minta port ke pengguna lalu tulis job. Port selalu ditutup di `finally`.
 * `requestPort` boleh melempar NotFoundError saat dialog dibatalkan.
 */
/**
 * Antrean tulis per-port.
 *
 * Web Serial hanya mengizinkan satu writer, tetapi dua jalur (auto-print dan
 * tombol manual) bisa menulis ke port yang sama hampir bersamaan. Tanpa
 * antrean, chunk 256-byte dari dua job saling menyisip: struk keluar rusak
 * dengan teks tergabung ("WaktKLIK FOTO DEV") dan baris melewati lebar kolom.
 */
const writeChains = new WeakMap<object, Promise<unknown>>();

function enqueueWrite<T>(port: object, task: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(port) ?? Promise.resolve();
  const next = prev.then(task, task);
  writeChains.set(
    port,
    next.catch(() => undefined)
  );
  return next;
}

/** Satu siklus open→write→close untuk satu port. Selalu dipanggil di antrean. */
async function writeJobToPort(
  port: SerialPortLike,
  bytes: Uint8Array,
  options: SerialWriteOptions
): Promise<void> {
  try {
    await openSerialPort(port, options);
    if (!port.writable) {
      throw new SerialPrintError("WRITE_FAILED", "Port printer tidak bisa ditulis.");
    }
    const writer = port.writable.getWriter();
    const chunkSize = Math.max(1, options.chunkSize ?? SERIAL_CHUNK_DEFAULT);
    const sleep = options.sleep ?? defaultSleep;
    try {
      const writeTimeoutMs = options.writeTimeoutMs ?? SERIAL_WRITE_TIMEOUT_MS;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        if (options.signal?.aborted) throw abortError();
        const chunk = bytes.slice(offset, offset + chunkSize);
        try {
          await withTimeout(writer.write(chunk), writeTimeoutMs, writeTimeoutError);
        } catch (error) {
          if (error instanceof SerialPrintError) throw error;
          throw new SerialPrintError("WRITE_FAILED", "Gagal mengirim data ke printer.");
        }
        if (offset + chunkSize < bytes.length) {
          await sleep(options.writeGapMs ?? SERIAL_WRITE_GAP_MS);
        }
      }
      await withTimeout(writer.ready, writeTimeoutMs, writeTimeoutError);
    } finally {
      try {
        writer.releaseLock();
      } catch {
        /* writer masih menggantung setelah timeout — kunci dilepas saat stream tutup */
      }
    }
  } finally {
    try {
      // `close()` pada link SPP yang sudah putus bisa menggantung; jangan
      // sampai hasil cetak (dan tombol retry) menunggu selamanya.
      await withTimeout(
        port.close(),
        options.closeTimeoutMs ?? SERIAL_CLOSE_TIMEOUT_MS,
        () => new Error("close timeout")
      );
    } catch {
      /* port mungkin sudah tertutup setelah error */
    }
  }
}

export async function writeEscPosSerial(
  bytes: Uint8Array,
  options: SerialWriteOptions = {}
): Promise<void> {
  const serial = options.serial ?? getSerialApi();
  if (!serial) {
    throw new SerialPrintError(
      "UNSUPPORTED",
      "Browser ini tidak mendukung Web Serial. Gunakan Chrome desktop atau dialog cetak sistem."
    );
  }
  if (options.signal?.aborted) throw abortError();

  let port: SerialPortLike;
  try {
    port = await serial.requestPort();
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      throw new SerialPrintError("NO_PORT", "Tidak ada printer dipilih.");
    }
    throw new SerialPrintError("NO_PORT", "Printer tidak bisa dipilih.");
  }

  await enqueueWrite(port, () => writeJobToPort(port, bytes, options));
}

/**
 * Tulis ke port yang SUDAH diizinkan tanpa membuka chooser.
 *
 * Dipakai auto-print: `requestPort()` wajib gestur pengguna, jadi setelah
 * pairing pertama port tersimpan di origin dan bisa dipakai ulang lewat
 * `getPorts()`. Bila belum ada port, kembalikan `false` supaya UI menampilkan
 * tombol manual (bukan error).
 */
export async function writeEscPosSerialGranted(
  bytes: Uint8Array,
  options: SerialWriteOptions = {}
): Promise<boolean> {
  const serial = options.serial ?? getSerialApi();
  if (!serial) return false;
  if (options.signal?.aborted) throw abortError();

  let port: SerialPortLike | null = null;
  try {
    const ports = await serial.getPorts();
    port = ports[0] ?? null;
  } catch {
    return false;
  }
  if (!port) return false;

  await enqueueWrite(port, () => writeJobToPort(port, bytes, options));
  return true;
}
