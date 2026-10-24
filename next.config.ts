import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kiosk butuh akses kamera; batasi hanya untuk origin sendiri.
  // bluetooth=(self) wajib agar Web Bluetooth (printer thermal ESC/POS) tidak
  // ditolak Chrome lewat Permissions-Policy.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), bluetooth=(self)" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      // Runtime lokal kiosk (kamera + printer) berjalan di loopback dengan
      // skema http, jadi `'self'` dan `https:` tidak menjangkaunya. Tanpa entri
      // ini SEMUA panggilan kiosk → http://127.0.0.1:17777 diblokir CSP.
      "connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:*",
      "frame-src 'self' https://challenges.cloudflare.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // VPS self-host: server.js mandiri + node_modules hasil trace, dijalankan
  // systemd. `npm run start` menunjuk ke `.next/standalone/server.js`.
  output: "standalone",
  poweredByHeader: false,
  // Kompresi di Node; Nginx tetap meneruskan Accept-Encoding apa adanya.
  compress: true,
  reactStrictMode: true,
  // Dev server Next 15+ menolak (403) request subresource dengan Origin
  // tak dikenal — tunnel ngrok WAJIB didaftarkan agar chunk JS kiosk
  // ter-load (tanpa ini hydration mati: tombol aktifasi tidak respons).
  // Entri = hostname TANPA protokol (perbandingan string di Next),
  // wildcard menutup URL ngrok yang berubah tiap sesi.
  ...(process.env.NODE_ENV === "development"
    ? {
        allowedDevOrigins: [
          "graph-headstand-copper.ngrok-free.dev",
          "*.ngrok-free.dev",
          "*.ngrok.io",
        ],
      }
    : {}),
  // Upload frame (maks 5 MB, docs/04 §4.10) + thumbnail builder via
  // Server Action — default 1 MB terlalu kecil.
  // pdfkit (receipt invoice) memakai require AFM font + fs di runtime Node —
  // jangan di-bundle webpack. @node-rs/argon2 memuat binary .node native —
  // jangan di-bundle agar Vercel resolve optionalDependency linux-x64 dengan benar.
  serverExternalPackages: ["pdfkit", "@node-rs/argon2"],
  // pdfkit membaca file AFM/ICC dari disk via fs.readFileSync relatif ke modul;
  // Vercel file-tracing tidak otomatis menyalin node_modules/pdfkit/js/data/**
  // → receipt 500 di production. Include eksplisit ke route receipt.
  outputFileTracingIncludes: {
    "/dashboard/subscription/invoice/[id]/receipt": ["./node_modules/pdfkit/js/data/**/*"],
  },
  experimental: {
    // Batas klon body proxy (Next 16, `src/proxy.ts` match hampir semua path).
    // Default Next = 10 MB dan bersifat MEMOTONG, bukan menolak: body >10 MB
    // dipotong diam-diam lalu `request.formData()` gagal dengan
    // "Failed to parse body as FormData" → 500. Cap finalize app adalah 50 MB
    // (`FINALIZE_MAX_REQUEST_BYTES`), jadi upload kiosk 10-50 MB GAGAL total.
    // Di-set di atas cap route supaya route sendiri yang memberi 413
    // berdasarkan `content-length` (dicek SEBELUM body diparse).
    proxyClientMaxBodySize: "52mb",
    serverActions: {
      // Fase 3: batas 8 MB ini MENAHAN upload server-action yang cap-nya lebih
      // besar (VIDEO_MAX_BYTES=15 MB, PHOTO_MAX_BYTES=10 MB) — validasi ukuran
      // tidak dihapus, tetapi request >8 MB ditolak Next SEBELUM action jalan.
      // Foto finalize lewat API route (request.formData), bukan server action,
      // jadi tidak terkena batas ini. Direct-to-R2 upload tetap Phase berikutnya
      // bila video >8 MB via server action harus didukung (lihat docs/09 §9.6).
      bodySizeLimit: "8mb",
    },
  },
  // next/image whitelist untuk asset publik Supabase Storage (docs/09 §9).
  // Signed URL/publik keluar dari `<project>.supabase.co/storage/v1/object/...`;
  // wildcard '*.supabase.co' cover semua region. Bila di-self-host di
  // subdomain custom, tambahkan pattern lain lewat env (mis. STORAGE_HOST).
  images: {
    // VPS 2 vCPU: optimasi gambar (sharp) memakan RAM dan CPU per request.
    // Gambar di-serve langsung dari URL aslinya.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.in",
        pathname: "/storage/v1/object/**",
      },
      // R2 presigned GET (Fase 4 dual-storage read). `getSignedUrl` meng-hasilkan
      // host S3 API: path-style `<accountId>.r2.cloudflarestorage.com/<bucket>/<key>`
      // (forcePathStyle:true di `lib/r2/config.ts`) atau virtual-hosted
      // `<bucket>.<accountId>.r2.cloudflarestorage.com`. Host TIDAK di-hardcode —
      // account id dinamis dari env — jadi `**.` menutup base domain + semua
      // kedalaman subdomain (kedua bentuk). TIDAK memakai `.r2.dev`/custom domain
      // (itu hanya untuk bucket PUBLIK; object tetap private via signed URL).
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
