import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// UI di-bundle lokal dan disalin langsung ke folder aset Shell, supaya WebView2
// memetakannya lewat SetVirtualHostNameToFolderMapping("snapyos.app", ...).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../src/SnapyOS.Booth.Shell/Assets/ui",
    emptyOutDir: true,
    target: "es2022",
  },
});
