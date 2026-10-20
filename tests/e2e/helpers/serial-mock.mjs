/**
 * Mock Web Serial untuk menguji jalur UI SPP tanpa hardware.
 *
 * Menangkap byte yang ditulis ke port supaya spec bisa memastikan job yang
 * benar-benar keluar dari browser adalah ESC/POS valid, bukan sekadar status UI.
 */

export async function installSerialMock(page) {
  await page.addInitScript(() => {
    const chunks = [];
    const listeners = new Map();
    const port = {
      getInfo: () => ({ bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb" }),
      async open() {},
      async close() {},
      get writable() {
        return {
          getWriter() {
            return {
              async write(value) {
                chunks.push(Array.from(new Uint8Array(value)));
              },
              async close() {},
              releaseLock() {},
              ready: Promise.resolve(),
            };
          },
        };
      },
    };

    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: {
        async requestPort() {
          return port;
        },
        async getPorts() {
          return [port];
        },
        addEventListener(type, handler) {
          const list = listeners.get(type) ?? [];
          list.push(handler);
          listeners.set(type, list);
        },
        removeEventListener(type, handler) {
          listeners.set(
            type,
            (listeners.get(type) ?? []).filter((entry) => entry !== handler)
          );
        },
      },
    });

    window.__serialBytes = () => chunks.flat();
    window.__serialReset = () => {
      chunks.length = 0;
    };
  });
}

export async function readSerialBytes(page) {
  return page.evaluate(() => (window.__serialBytes ? window.__serialBytes() : []));
}

export async function resetSerialBytes(page) {
  await page.evaluate(() => window.__serialReset?.());
}
