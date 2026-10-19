"use client";

/**
 * Transport Web Bluetooth untuk printer thermal ESC/POS.
 *
 * Batasan platform yang disengaja (tidak disembunyikan dari UI):
 * - Chrome/Edge desktop & Android saja. iOS/iPadOS tidak punya Web Bluetooth.
 * - `requestDevice` wajib gestur pengguna; tidak bisa auto-pair saat boot.
 * - Hanya printer ESC/POS (thermal). Printer foto konsumen (Selphy/Sprocket)
 *   memakai protokol GATT proprietary dan tetap lewat dialog OS.
 * - Web Bluetooth tidak mengekspos MTU, jadi chunk 20 byte adalah ukuran yang
 *   aman untuk semua printer; write di-await berurutan (backpressure).
 */

/** Service GATT yang umum dipakai printer thermal ESC/POS. */
export const ESCPOS_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // printer generik (Epson-compatible)
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb", // sebagian printer Cina
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 style
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC/Microchip transparent UART
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
] as const;

/**
 * Prefix nama perangkat thermal yang lazim. Sebagian printer murah TIDAK
 * mengiklankan service UUID di advertisement, sehingga filter berbasis service
 * saja membuat printer (mis. RPP20N) tidak muncul di pemilih Chrome. Filter
 * nama adalah jalur cadangan yang tetap terkontrol.
 */
export const THERMAL_NAME_PREFIXES = ["RPP", "RTP", "XP-", "Xprinter", "MPT", "POS", "Printer", "Thermal", "BT-"] as const;

export const BLE_CHUNK_DEFAULT = 20;

export type EscPosLink = {
  device: BluetoothDevice;
  serviceUuid: string;
  writeUuid: string;
  supportsNoResponse: boolean;
  /** Tulis byte berurutan dengan chunk yang aman. */
  write(bytes: Uint8Array, options?: { chunkSize?: number; signal?: AbortSignal }): Promise<void>;
  disconnect(): void;
};

export class BluetoothPrintError extends Error {
  code:
    | "UNSUPPORTED"
    | "NO_DEVICE"
    | "NO_WRITABLE_CHARACTERISTIC"
    | "DISCONNECTED"
    | "WRITE_FAILED"
    | "ABORTED";
  constructor(code: BluetoothPrintError["code"], message: string) {
    super(message);
    this.name = "BluetoothPrintError";
    this.code = code;
  }
}

export function isBluetoothPrintSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.bluetooth);
}

/**
 * Buka pemilih perangkat. `acceptAllDevices` hanya dipakai lewat tombol
 * "Cari printer lain", filter service adalah jalur utama karena selector
 * tanpa filter membingungkan petugas.
 */
export async function requestEscPosDevice(options: { acceptAll?: boolean } = {}): Promise<BluetoothDevice> {
  const bluetooth = navigator.bluetooth;
  if (!bluetooth) {
    throw new BluetoothPrintError("UNSUPPORTED", "Browser ini tidak mendukung Bluetooth langsung. Gunakan Chrome.");
  }
  const request: BluetoothRequestDeviceOptions = options.acceptAll
    ? { acceptAllDevices: true, optionalServices: [...ESCPOS_SERVICES] }
    : {
        filters: [
          { services: [...ESCPOS_SERVICES] },
          // Printer yang tidak mengiklankan service UUID (mis. RPP20N) tetap
          // bisa dipilih lewat nama; koneksi tetap divalidasi karakteristik.
          ...THERMAL_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
        ],
        optionalServices: [...ESCPOS_SERVICES],
      };
  try {
    return await bluetooth.requestDevice(request);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new BluetoothPrintError("NO_DEVICE", "Tidak ada printer dipilih.");
    }
    throw new BluetoothPrintError("NO_DEVICE", "Printer tidak bisa dipilih. Nyalakan printer lalu coba lagi.");
  }
}

function findWriteCharacteristic(
  characteristics: BluetoothRemoteGATTCharacteristic[]
): BluetoothRemoteGATTCharacteristic | null {
  const writable = characteristics.filter(
    (c) => c.properties.write || c.properties.writeWithoutResponse
  );
  if (writable.length === 0) return null;
  // Utamakan karakteristik standar printer (2af1 pada service 18f0).
  return writable.find((c) => c.uuid.includes("2af1")) ?? writable.find((c) => c.uuid.includes("ffe1")) ?? writable[0]!;
}

/** Sambungkan device yang sudah dipilih. Melempar `NO_WRITABLE_CHARACTERISTIC`
 *  bila device bukan printer ESC/POS (mis. printer foto konsumen). */
export async function connectEscPos(
  device: BluetoothDevice,
  options: { onDisconnect?: () => void } = {}
): Promise<EscPosLink> {
  const gatt = device.gatt;
  if (!gatt) {
    throw new BluetoothPrintError("NO_WRITABLE_CHARACTERISTIC", "Perangkat ini bukan printer ESC/POS.");
  }
  const server = gatt.connected ? gatt : await gatt.connect();
  // Jangan hanya mengandalkan service di advertisement: banyak printer
  // (termasuk RPP20N) baru mengekspos service setelah terhubung.
  const services = await server.getPrimaryServices().catch(() => []);

  let service: BluetoothRemoteGATTService | null = null;
  let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  for (const candidate of services) {
    const characteristics = await candidate.getCharacteristics();
    const writable = findWriteCharacteristic(characteristics);
    if (writable) {
      service = candidate;
      characteristic = writable;
      break;
    }
  }
  if (!service || !characteristic) {
    throw new BluetoothPrintError(
      "NO_WRITABLE_CHARACTERISTIC",
      "Printer ini tidak mendukung ESC/POS lewat Bluetooth. Gunakan dialog cetak sistem."
    );
  }

  let disconnected = false;
  const onGattDisconnected = () => {
    disconnected = true;
    options.onDisconnect?.();
  };
  device.addEventListener("gattserverdisconnected", onGattDisconnected);

  const supportsNoResponse = Boolean(characteristic.properties.writeWithoutResponse);
  const target = characteristic;
  const serviceUuid = service.uuid;
  const writeUuid = characteristic.uuid;

  return {
    device,
    serviceUuid,
    writeUuid,
    supportsNoResponse,
    async write(bytes, writeOptions = {}) {
      const chunkSize = Math.max(1, writeOptions.chunkSize ?? BLE_CHUNK_DEFAULT);
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        if (writeOptions.signal?.aborted) {
          throw new BluetoothPrintError("ABORTED", "Cetak dibatalkan.");
        }
        if (disconnected) {
          throw new BluetoothPrintError("DISCONNECTED", "Koneksi printer terputus.");
        }
        const chunk = bytes.slice(offset, offset + chunkSize);
        try {
          if (supportsNoResponse && target.writeValueWithoutResponse) {
            await target.writeValueWithoutResponse(chunk);
          } else {
            await target.writeValue(chunk);
          }
        } catch {
          if (disconnected) {
            throw new BluetoothPrintError("DISCONNECTED", "Koneksi printer terputus.");
          }
          throw new BluetoothPrintError("WRITE_FAILED", "Gagal mengirim data ke printer.");
        }
      }
    },
    disconnect() {
      device.removeEventListener("gattserverdisconnected", onGattDisconnected);
      try {
        device.gatt?.disconnect();
      } catch {
        /* sudah terputus */
      }
    },
  };
}

/**
 * Koneksi ulang tanpa pemilih perangkat. Chrome menyimpan izin per origin,
 * jadi `getDevices()` bisa mengembalikan device yang pernah dipilih.
 */
export async function reconnectGranted(): Promise<BluetoothDevice | null> {
  const bluetooth = navigator.bluetooth;
  if (!bluetooth?.getDevices) return null;
  try {
    const devices = await bluetooth.getDevices();
    return devices[0] ?? null;
  } catch {
    return null;
  }
}
