// UI booth tidak memakai PostCSS maupun Tailwind.
//
// Berkas ini sengaja ada supaya Vite berhenti mencari config ke atas: root repo
// punya `postcss.config.mjs` yang memuat `@tailwindcss/postcss`, dan plugin itu
// tidak terpasang di `booth/ui/node_modules`. Tanpa berkas ini build UI hanya
// berhasil di mesin yang kebetulan punya `node_modules` root (lokal), lalu gagal
// di CI dengan "Cannot find module '@tailwindcss/postcss'".
const config = {
  plugins: {},
};

export default config;
