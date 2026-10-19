/**
 * Mock `navigator.bluetooth` untuk menguji jalur ESC/POS tanpa hardware.
 *
 * Byte yang ditulis disimpan di `window.__btChunks` (array Uint8Array) supaya
 * spec bisa memeriksa header/footer job dan reassembly chunk. `disconnect()`
 * memicu event `gattserverdisconnected` untuk menguji jalur error.
 */

export async function installBluetoothMock(page, options = {}) {
  await page.addInitScript(({ writable, chunkLimit }) => {
    const chunks = [];
    const listeners = new Map();
    let written = 0;

    const device = {
      id: "mock-printer",
      name: "MOCK ESCPOS",
      gatt: {
        connected: false,
        async connect() {
          this.connected = true;
          return this;
        },
        disconnect() {
          this.connected = false;
          const handlers = listeners.get("gattserverdisconnected") ?? [];
          for (const handler of handlers) handler(new Event("gattserverdisconnected"));
        },
        async getPrimaryServices() {
          return [service];
        },
      },
      addEventListener(type, handler) {
        const list = listeners.get(type) ?? [];
        list.push(handler);
        listeners.set(type, list);
      },
      removeEventListener(type, handler) {
        const list = listeners.get(type) ?? [];
        listeners.set(type, list.filter((entry) => entry !== handler));
      },
    };

    const characteristic = {
      uuid: "00002af1-0000-1000-8000-00805f9b34fb",
      properties: { write: true, writeWithoutResponse: writable },
      async writeValue(value) {
        if (chunkLimit !== null && written >= chunkLimit) {
          throw new DOMException("Write failed", "NetworkError");
        }
        written += 1;
        chunks.push(Array.from(new Uint8Array(value)));
      },
      async writeValueWithoutResponse(value) {
        return this.writeValue(value);
      },
    };

    const service = {
      uuid: "000018f0-0000-1000-8000-00805f9b34fb",
      async getCharacteristics() {
        return [characteristic];
      },
    };

    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        async requestDevice() {
          return device;
        },
        async getDevices() {
          return [device];
        },
      },
    });

    window.__btDevice = device;
    window.__btChunks = chunks;
    window.__btBytes = () => chunks.flat();
    window.__btReset = () => {
      chunks.length = 0;
      written = 0;
    };
  }, { writable: options.writable ?? true, chunkLimit: options.chunkLimit ?? null });
}

export async function readPrinterBytes(page) {
  return page.evaluate(() => (window.__btBytes ? window.__btBytes() : []));
}

export async function dropPrinterConnection(page) {
  await page.evaluate(() => window.__btDevice?.gatt?.disconnect());
}
