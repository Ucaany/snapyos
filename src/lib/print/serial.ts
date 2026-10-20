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
export const SERIAL_CHUNK_DEFAULT = 512;
/** Printer SPP sering menolak open pertama setelah idle; jeda ini terbukti
 *  cukup pada RPPO2N tanpa membuat UI terasa macet. */
export const SERIAL_OPEN_RETRIES = 4;
export const SERIAL_RETRY_DELAY_MS = 1200;
export const SERIAL_WRITE_GAP_MS = 25;

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
  serial?: SerialLike | null;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function abortError(): SerialPrintError {
  return new SerialPrintError("ABORTED", "Cetak dibatalkan.");
}

/** Buka port dengan retry; port SPP dapat menjawab NetworkError sekali. */
export async function openSerialPort(
  port: SerialPortLike,
  options: Omit<SerialWriteOptions, "signal" | "serial"> = {}
): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  const retries = Math.max(1, options.openRetries ?? SERIAL_OPEN_RETRIES);
  const baudRate = options.baudRate ?? SERIAL_DEFAULT_BAUD;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
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

  try {
    await openSerialPort(port, options);
    if (!port.writable) {
      throw new SerialPrintError("WRITE_FAILED", "Port printer tidak bisa ditulis.");
    }
    const writer = port.writable.getWriter();
    const chunkSize = Math.max(1, options.chunkSize ?? SERIAL_CHUNK_DEFAULT);
    const sleep = options.sleep ?? defaultSleep;
    try {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        if (options.signal?.aborted) throw abortError();
        const chunk = bytes.slice(offset, offset + chunkSize);
        try {
          await writer.write(chunk);
        } catch {
          throw new SerialPrintError("WRITE_FAILED", "Gagal mengirim data ke printer.");
        }
        if (offset + chunkSize < bytes.length) {
          await sleep(options.writeGapMs ?? SERIAL_WRITE_GAP_MS);
        }
      }
      await writer.ready;
    } finally {
      writer.releaseLock();
    }
  } finally {
    try {
      await port.close();
    } catch {
      /* port mungkin sudah tertutup setelah error */
    }
  }
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

  try {
    await openSerialPort(port, options);
    if (!port.writable) {
      throw new SerialPrintError("WRITE_FAILED", "Port printer tidak bisa ditulis.");
    }
    const writer = port.writable.getWriter();
    const chunkSize = Math.max(1, options.chunkSize ?? SERIAL_CHUNK_DEFAULT);
    const sleep = options.sleep ?? defaultSleep;
    try {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        if (options.signal?.aborted) throw abortError();
        const chunk = bytes.slice(offset, offset + chunkSize);
        try {
          await writer.write(chunk);
        } catch {
          throw new SerialPrintError("WRITE_FAILED", "Gagal mengirim data ke printer.");
        }
        if (offset + chunkSize < bytes.length) {
          await sleep(options.writeGapMs ?? SERIAL_WRITE_GAP_MS);
        }
      }
      await writer.ready;
    } finally {
      writer.releaseLock();
    }
  } finally {
    try {
      await port.close();
    } catch {
      /* port mungkin sudah tertutup setelah error */
    }
  }
  return true;
}
