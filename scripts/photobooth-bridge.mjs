#!/usr/bin/env node
/**
 * Launcher tipis. Implementasi ada di `runtime/main.ts`.
 *
 * Nama berkas dan `npm run bridge:local` dipertahankan agar dokumentasi,
 * service/task yang sudah terpasang, dan tes lama tetap menunjuk ke titik masuk
 * yang sama.
 */

await import("../runtime/main.ts");
