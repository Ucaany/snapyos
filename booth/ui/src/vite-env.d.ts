/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL bridge lokal saat menjalankan `vite dev` di peramban. */
  readonly VITE_BRIDGE_URL?: string;
  /** Token bridge saat menjalankan `vite dev` di peramban. */
  readonly VITE_BRIDGE_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
