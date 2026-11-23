/**
 * Panduan publik SnapyOS untuk customer dan owner photobooth.
 * Public entry: `/docs`.
 * Sumber fakta: docs/05-customer-photobox.md, docs/06-checkout-payment.md,
 * docs/02-business-subscription.md, docs/flow-maps/02-OWNER-DASHBOARD-FLOW.md,
 * db/schema.sql (retention max 3 hari, integer IDR).
 * ponytail: artikel sebagai modul konten terstruktur di repo (versi via git);
 * upgrade ke MDX (tanpa CMS) saat @next/mdx ditambahkan.
 */

export type HelpTable = { head: string[]; rows: string[][]; caption?: string };
export type HelpCode = { label?: string; lang?: string; code: string };
export type HelpTrouble = { gejala: string; penyebab: string; solusi: string };

export type HelpSection = {
  heading: string;
  anchor?: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
  table?: HelpTable;
  code?: HelpCode;
  note?: string;
  /** Legacy fallback: string campur paragraf dan "Langkah N: ...". */
  items?: string[];
};

export type HelpArticle = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  audience?: string;
  estimate?: string;
  prerequisites?: string[];
  sections: HelpSection[];
  troubleshooting?: HelpTrouble[];
  nextSteps?: { title: string; slug: string; desc?: string }[];
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "quick-start",
    title: "Mulai Cepat di Booth",
    category: "Customer",
    summary:
      "Tiga langkah dari nol ke foto pertama. Tidak perlu login, tidak perlu install aplikasi.",
    audience: "Customer (pengunjung booth)",
    estimate: "5 menit",
    prerequisites: [],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Anda tidak perlu login dan tidak perlu install aplikasi. Seluruh alur berjalan di layar kiosk milik brand booth, dari pilih paket sampai scan QR hasil.",
          "Prinsipnya pay first. Anda memilih paket, menyelesaikan pembayaran, lalu sesi foto terbuka. Foto baru diambil setelah pembayaran dinyatakan paid oleh server. Timer sesi baru mulai di titik paid, waktu menunggu QR tidak memakan jatah sesi.",
        ],
      },
      {
        heading: "1. Pilih paket",
        paragraphs: [
          "Sentuh tombol Mulai di welcome screen. Perhatikan nama brand, logo, dan tagline untuk memastikan Anda di booth yang benar. Daftar kartu paket menampilkan harga dalam Rupiah, jumlah foto, dan jumlah cetak.",
          "Paket yang tampil sudah difilter untuk booth dan outlet tempat Anda berdiri. Jika paket yang Anda cari tidak muncul, tanyakan ke operator apakah paket itu berlaku di booth ini.",
        ],
        steps: [
          "Baca kartu paket dengan teliti: harga, jumlah foto, jumlah cetak.",
          "Sentuh paket pilihan untuk masuk ke layar checkout. Harga di sini adalah harga dasar sebelum voucher.",
        ],
      },
      {
        heading: "2. Bayar",
        paragraphs: [
          "Periksa order summary berisi nama paket, kolom voucher opsional, diskon, dan total akhir. Pilih metode bayar: scan QRIS dari HP Anda, masukkan kode voucher, atau minta operator untuk metode tunai.",
          "Untuk QRIS, bayar sebesar total yang tampil termasuk kode unik kecil di belakang nominal. Kode ini membantu pencocokan otomatis via webhook. Timer kedaluwarsa tampil di bawah QR, default 3 menit.",
        ],
        steps: [
          "Periksa total akhir di order summary.",
          "Scan QRIS dan bayar penuh, atau apply voucher, atau serahkan tunai ke operator.",
          "Tunggu status berubah menjadi paid. Jangan tutup halaman selama menunggu.",
        ],
        note: "Bila booth belum mengaktifkan gateway, kiosk hanya menawarkan voucher dan tunai. Ini normal dan bukan error.",
      },
      {
        heading: "3. Foto dan bawa pulang hasil",
        paragraphs: [
          "Pilih frame dari grid preview. Thumbnail menampilkan gambar frame yang diunggah apa adanya, bukan contoh foto yang terpasang di slot. Semua template aktif tampil untuk paket mana pun; frame yang memiliki slot menentukan jumlah foto yang diambil.",
          "Ikuti hitungan mundur 3, 2, 1 di layar. Posisikan wajah di dalam preview dan tunggu efek flash putih sebagai tanda foto diambil. Timer sesi default 5 menit, retake bebas selama timer berjalan.",
        ],
        steps: [
          "Pilih frame yang Anda suka.",
          "Ikuti countdown dan ambil foto. Retake bila perlu, lalu atur zoom dan filter di editor.",
          "Tekan Selesai. Hasil otomatis dicetak bila paket termasuk cetak.",
          "Scan QR result di layar dengan HP untuk mengunduh GIF dan foto berframe.",
        ],
      },
      {
        heading: "Cek hasil tersimpan",
        paragraphs: [
          "Halaman result online berisi preview GIF animasi yang autoplay loop dan grid foto berframe. Semua file bisa diunduh satu per satu langsung dari browser HP tanpa aplikasi tambahan.",
          "Link result memiliki masa simpan 1 sampai 3 hari sesuai pengaturan booth, default 3 hari. Unduh di hari yang sama. Sesi bersifat one shot: setelah selesai, kiosk kembali ke welcome screen untuk pengunjung berikutnya.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "QR tidak bisa dibayar, timer habis",
        penyebab: "Melewati masa kedaluwarsa QR (default 3 menit)",
        solusi: "Kembali ke pilih paket dan buat QR baru. Satu booth hanya punya satu QR hidup.",
      },
      {
        gejala: "Sudah bayar tapi status masih menunggu",
        penyebab: "Webhook atau polling belum sampai",
        solusi:
          "Tunggu beberapa detik, jangan reload berulang. Status dipulihkan otomatis dari server.",
      },
      {
        gejala: "Link hasil tidak terbuka",
        penyebab: "Melewati masa retention 1 sampai 3 hari",
        solusi: "Minta owner mengunduh ulang dari dashboard bila sesi masih tersimpan.",
      },
    ],
    nextSteps: [
      {
        title: "Alur Foto Customer",
        slug: "panduan-photobox",
        desc: "Penjelasan tiap layar kiosk.",
      },
      { title: "Cara Bayar di Kiosk", slug: "panduan-qris", desc: "QRIS, voucher, dan tunai." },
      { title: "Hasil Foto Online", slug: "hasil-foto", desc: "Buka QR result dan unduh file." },
    ],
  },
  {
    slug: "panduan-owner-mulai",
    title: "Owner: Dari Akun sampai Booth Live",
    category: "Owner",
    summary:
      "Akun dibuat admin, lalu Anda membuat business, outlet, photobox, paket, pembayaran, dan aktivasi device. Target di bawah 15 menit untuk setup dasar setelah akun aktif.",
    audience: "Owner photobooth",
    estimate: "15 menit untuk setup dasar",
    prerequisites: [
      "Email aktif untuk login setelah akun dibuat admin.",
      "Nama business, slug, dan timezone.",
      "Satu device kiosk (mini PC + webcam, atau tablet) dan satu printer bila paket termasuk cetak.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Anda mengelola semua booth dari satu dashboard. Satu akun bisa memegang banyak business, dan tiap business punya outlet, photobox, paket, dan template sendiri.",
          "Urutan yang benar adalah akun, business, outlet, photobox, paket, pembayaran, lalu aktivasi device. Jangan aktivasi device sebelum paket dan pembayaran siap, karena kiosk langsung menampilkan katalog aktif.",
        ],
      },
      {
        heading: "1. Akun dan business",
        paragraphs: [
          "Pendaftaran mandiri ditutup. Hubungi tim lewat WhatsApp atau halaman kontak; admin platform membuat akun, lalu Anda login dan diarahkan ke pemilih peran. Buat business pertama lewat onboarding create business: isi nama, slug, dan timezone. Slug dipakai di URL publik kiosk.",
          "Pilih plan Starter Rp99.000, Growth Rp249.000, atau Business Rp499.000 per bulan. Semua plan base berisi 1 outlet, 1 photobox, dan 1 sesi bersamaan. Tambahan sesi bersamaan lewat add-on Rp49.000 per bulan.",
        ],
        steps: [
          "Minta akun ke tim SnapyOS, lalu login dengan email Anda.",
          "Buat business: isi nama, slug huruf kecil, dan timezone.",
          "Pilih plan sesuai kebutuhan. Cek limit outlet, photobox, staff, dan storage sebelum lanjut.",
        ],
        table: {
          head: ["Plan", "Harga per bulan", "Base", "Cocok untuk"],
          rows: [
            ["Starter", "Rp99.000", "1 outlet, 1 photobox, 1 sesi", "Booth pertama"],
            ["Growth", "Rp249.000", "Base + direct payment, staff, finance", "UMKM bertumbuh"],
            [
              "Business",
              "Rp499.000",
              "Growth + storage, reports, voucher",
              "Booth dengan laporan lengkap dan voucher",
            ],
          ],
        },
      },
      {
        heading: "2. Outlet dan photobox",
        paragraphs: [
          "Outlet adalah lokasi fisik. Photobox adalah booth di dalam outlet. Saat ini semua plan base dibatasi 1 outlet dan 1 photobox. Limit plan di enforce server side: membuat outlet atau booth melebihi max ditolak dengan error plan limit.",
          "Atur session settings per booth sejak awal. Default timer 300 detik, warning 60 detik, max retakes kosong berarti unlimited selama timer berjalan. Timer mulai saat webhook paid, bukan saat QR tampil.",
        ],
        steps: [
          "Buka Outlets, tekan Buat Outlet. Isi nama wajib, alamat, kota, provinsi. Status default active.",
          "Buka Photoboxes, tekan Buat Photobox. Isi nama, slug unik per business, dan outlet induk.",
          "Atur timer sesi, countdown kamera, mirror preview, fullscreen, resolusi capture, dan print settings (4x6, single, auto print).",
        ],
        code: {
          label: "Contoh session settings per booth",
          lang: "json",
          code: '{\n  "timer_seconds": 300,\n  "warning_seconds": 60,\n  "max_retakes": null\n}',
        },
      },
      {
        heading: "3. Paket dan template",
        paragraphs: [
          "Package menentukan harga, jumlah foto (photo count), dan jumlah cetak (print count). Assign package ke outlet dan photobox yang berlaku: customer hanya melihat paket yang eligible di booth tempat ia berdiri.",
          "Template adalah frame PNG yang menampung foto. Frame ber-slot menentukan jumlah capture: frame 6 slot mengambil 6 foto, bukan mengikuti photo count paket. Template legacy tanpa slot memakai photo count paket. Builder preview dan editor kiosk sama-sama memakai composeFrame; JPEG final dirender di editor kiosk lalu dipakai apa adanya oleh print dan result online (tanpa render ulang di server).",
        ],
        steps: [
          "Buka Packages, tekan Buat Package. Isi nama, harga integer Rupiah di atas nol, photo count minimal 1, print count minimal 0.",
          "Assign package ke outlet dan photobox yang berlaku.",
          "Buka Templates, upload PNG frame transparan maksimal 5 MB, pilih kategori.",
          "Buka builder, tambah slot manual atau tekan Deteksi area hijau bila frame memakai latar hijau sebagai slot, atur warna dasar kanvas, Preview, lalu Publish.",
          "Uji dari kiosk: pilih paket, bayar, pastikan frame muncul.",
        ],
      },
      {
        heading: "4. Pembayaran dan aktivasi device",
        paragraphs: [
          "Model dana adalah direct merchant: customer membayar ke project merchant owner, bukan ke akun platform. Credential disimpan di tabel payment credentials per business, bukan env. Tanpa credential aktif, kiosk hanya voucher dan tunai.",
          "Pairing memakai kode sekali pakai kedaluwarsa sekitar 5 menit. Server menerbitkan device token persisten sampai di revoke. Setup wizard (grant kamera, pilih kamera, cek resolusi, print test) berjalan sekali dan tersembunyi dari customer.",
        ],
        steps: [
          "Buka Settings Payment, tambah credential Tripay atau Midtrans milik Anda.",
          "Tekan Test, lalu aktifkan toggle is active.",
          "Di detail photobox tekan Tampilkan Kode atau QR.",
          "Di device kiosk buka URL /p/[slug-business]/[slug-photobox], masukkan kode atau scan QR.",
          "Jalankan setup wizard sekali sampai masuk welcome screen branding Anda.",
        ],
        code: {
          label: "Pola URL publik kiosk",
          lang: "text",
          code: "/p/[businessSlug]/[photoboxSlug]",
        },
        note: "Server key dienkripsi AES 256 GCM sebelum disimpan dan tidak pernah dikembalikan ke frontend.",
      },
    ],
    troubleshooting: [
      {
        gejala: "Kode aktivasi ditolak",
        penyebab: "Kode kedaluwarsa (sekitar 5 menit) atau sudah dipakai",
        solusi: "Generate kode baru dari dashboard lalu input dalam 5 menit.",
      },
      {
        gejala: "Kiosk hanya menampilkan voucher dan tunai",
        penyebab: "Belum ada credential gateway aktif",
        solusi: "Tambah dan aktifkan credential di Settings Payment.",
      },
      {
        gejala: "Gagal buat outlet atau booth: PLAN_LIMIT_REACHED",
        penyebab: "Melebihi max plan",
        solusi: "Upgrade plan atau beli add on sesi tambahan.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Kelola Outlet dan Booth",
        slug: "panduan-photobox-owner",
        desc: "Device, kamera, printer, timer.",
      },
      {
        title: "Owner: Atur QRIS dan Credential",
        slug: "panduan-payment-setup",
        desc: "Gateway merchant sendiri.",
      },
      {
        title: "Owner: Template dan Frame",
        slug: "panduan-template",
        desc: "Slot builder dan default booth.",
      },
    ],
  },
  {
    slug: "panduan-photobox",
    title: "Alur Foto Customer",
    category: "Customer",
    summary:
      "Penjelasan rapi tiap layar kiosk. Apa yang tampil, apa yang perlu Anda lakukan, dan berapa lama waktunya.",
    audience: "Customer (pengunjung booth)",
    estimate: "7 menit baca",
    prerequisites: [
      "Berdiri di depan layar kiosk yang sudah aktif (welcome screen brand terlihat).",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Layar kiosk dirancang muat satu viewport tanpa scroll. Heading kompak, tombol besar, dan countdown selalu terlihat. Urutan resmi adalah welcome, pilih paket, checkout, voucher, QRIS payment, paid (timer mulai), pilih template, kamera, countdown, capture, review, retake atau continue, edit, finalize, auto print, result QR, lalu result online.",
          "Permission kamera dan printer sudah diurus saat setup device oleh owner. Anda tidak akan pernah melihat layar teknis tersebut. Fokus Anda hanya paket, bayar, frame, foto, dan hasil.",
        ],
      },
      {
        heading: "Layar 1: pilih paket",
        paragraphs: [
          "Setiap kartu paket menampilkan nama, harga, detail foto, print, dan digital. Harga di sini adalah harga dasar sebelum voucher.",
        ],
        steps: [
          "Baca kartu paket: harga, jumlah foto, jumlah cetak.",
          "Pastikan paket berlaku di booth ini. Paket difilter per outlet dan photobox.",
          "Sentuh paket pilihan untuk masuk ke checkout.",
        ],
      },
      {
        heading: "Layar 2: bayar dulu, baru foto",
        paragraphs: [
          "Order summary menampilkan nama paket, kolom voucher opsional, diskon, dan total akhir. Semua nominal integer Rupiah dan dihitung ulang backend.",
          "Sesi foto hanya bisa dimulai setelah payment paid. Endpoint buat sesi mensyaratkan checkout session paid. Foto diupload ke storage setelah paid: tidak ada foto tersimpan tanpa pembayaran.",
        ],
        steps: [
          "Periksa total akhir.",
          "Pilih QRIS untuk scan mandiri, voucher untuk potongan, atau tunai via operator.",
          "Untuk QRIS: scan kode, bayar penuh termasuk kode unik, tunggu status paid.",
          "Timer sesi mulai tepat saat paid.",
        ],
        table: {
          head: ["Status bayar", "Arti", "Apa yang terjadi"],
          rows: [
            ["pending", "Menunggu pembayaran, QR tampil", "Timer sesi belum jalan"],
            ["paid", "Dana diterima", "Sesi terbuka, timer mulai, result token diterbitkan"],
            ["expired atau failed", "QR hangus atau gagal", "Coba ulang dengan QR baru"],
          ],
        },
      },
      {
        heading: "Layar 3: pilih frame dan sesi foto",
        paragraphs: [
          "Grid preview menampilkan thumbnail frame yang diunggah apa adanya, bukan composite slot. Semua template aktif tampil di setiap paket; frame ber-slot menentukan jumlah capture dan template legacy memakai photo_count package.",
          "Jumlah foto mengikuti template terpilih. Photos order index mengikuti urutan slot z. Retake unlimited selama timer sesi berjalan, max retakes opsional via session settings.",
        ],
        steps: [
          "Pilih frame dari grid preview.",
          "Ikuti countdown per foto (default 3 detik) dan efek flash.",
          "Review tiap hasil. Retake selama timer masih berjalan.",
          "Jika waktu habis setelah bayar: auto finalize memakai foto terakhir, tetap cetak dan tetap dapat QR result.",
        ],
      },
      {
        heading: "Layar 4: edit dan selesai",
        paragraphs: [
          "Editor mengatur foto di dalam slot template, bukan full canvas. Zoom minimal mengikuti cover fit dan di clamp per slot. Template legacy tanpa slot memakai perilaku lama full canvas.",
          "Tersedia transform (crop, rotate, zoom, pan per slot), adjust (brightness, contrast, saturation, blur, grain, vignette), filter (Original, Film, Warm, Cool, Black White, Retro, Vintage, Y2K), sticker, dan text tool.",
        ],
        steps: [
          "Atur zoom dan posisi tiap foto di dalam slot.",
          "Coba filter dan adjust ringan.",
          "Tekan Selesai untuk finalize: foto final diupload, GIF dibuat server, cetak otomatis berjalan.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Frame yang dicari tidak muncul",
        penyebab: "Frame nonaktif, URL frame gagal, atau respons public template error",
        solusi: "Pilih frame yang tampil, atau tanya operator.",
      },
      {
        gejala: "Tidak bisa lanjut setelah bayar",
        penyebab: "Sesi belum dibuat atau timer habis",
        solusi: "Tunggu auto finalize, atau minta operator cek sesi di dashboard.",
      },
      {
        gejala: "Kamera error saat sesi",
        penyebab: "Kamera dicabut atau dipakai aplikasi lain",
        solusi: "Ikuti tombol Coba Lagi di layar, panggil operator bila berulang.",
      },
    ],
    nextSteps: [
      { title: "Cara Bayar di Kiosk", slug: "panduan-qris", desc: "Detail QRIS, voucher, tunai." },
      { title: "Hasil Foto Online", slug: "hasil-foto", desc: "Buka QR dan unduh file." },
      { title: "Atasi Masalah Umum", slug: "troubleshooting", desc: "Solusi per gejala." },
    ],
  },
  {
    slug: "hasil-foto",
    title: "Hasil Foto Online",
    category: "Customer",
    summary: "Cara membuka QR result, mengunduh GIF dan foto berframe, dan batas waktu unduhan.",
    audience: "Customer (pengunjung booth)",
    estimate: "3 menit",
    prerequisites: ["Sesi sudah finalize (paid) dan QR result tampil di layar kiosk."],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Setiap sesi paid menghasilkan QR result online di URL /r/[token]. QR tampil di layar kiosk setelah finalize dan auto print. Halaman result terbuka tanpa login.",
          "Halaman result memakai layout standar yang sama untuk semua brand demi konsistensi. Owner hanya bisa mengubah background via branding. Posisi, tata letak, dan komponen tidak bisa diubah.",
        ],
        code: { label: "Pola URL result", lang: "text", code: "/r/[token]" },
      },
      {
        heading: "Buka dan unduh hasil",
        paragraphs: [
          "Halaman menampilkan header branding owner (logo dan nama business), judul foto siap, preview GIF animasi slideshow yang autoplay loop, dan grid thumbnail foto berframe.",
          "Tersedia unduh dua GIF (proses kolase slot demi slot di sessions.result_gif_key dan slideshow semua foto mentah di sessions.result_photos_gif_key, keduanya digenerate server saat finalize) serta unduh foto berframe per file. Tidak ada aplikasi tambahan yang perlu diinstall.",
        ],
        steps: [
          "Scan QR di layar kiosk memakai kamera HP.",
          "Tonton preview GIF di bagian atas halaman.",
          "Buka grid thumbnail foto berframe.",
          "Unduh per foto atau unduh semua, lalu simpan ke galeri HP.",
        ],
      },
      {
        heading: "Masa simpan dan kedaluwarsa",
        paragraphs: [
          "Result token diterbitkan saat payment paid. Akses divalidasi server side. Expiration mengikuti retention policy per business: default 3 hari, rentang 1 sampai 3 hari.",
          "Link kedaluwarsa menampilkan pesan link kedaluwarsa. Unduh di hari yang sama untuk menghindari penghapusan otomatis oleh cron retention.",
        ],
        table: {
          head: ["Kondisi", "Arti", "Aksi"],
          rows: [
            ["Halaman terbuka normal", "Token valid dan dalam masa simpan", "Unduh segera"],
            [
              "Pesan link kedaluwarsa",
              "Melewati retention",
              "Minta owner unduh ulang bila sesi masih tersimpan",
            ],
            [
              "Halaman tidak ditemukan",
              "Token salah atau sesi dihapus",
              "Minta operator cek nomor transaksi",
            ],
          ],
        },
      },
    ],
    troubleshooting: [
      {
        gejala: "QR tidak bisa di scan",
        penyebab: "Cahaya layar atau jarak scan",
        solusi: "Dekatkan HP, naikkan brightness HP, atau ketik URL /r/[token] manual.",
      },
      {
        gejala: "File besar gagal diunduh",
        penyebab: "Jaringan HP tidak stabil",
        solusi: "Coba browser atau jaringan lain, unduh per foto bukan sekaligus.",
      },
      {
        gejala: "GIF tidak bergerak",
        penyebab: "Preview belum termuat penuh",
        solusi: "Reload halaman, tunggu loading selesai.",
      },
    ],
    nextSteps: [
      { title: "Mulai Cepat di Booth", slug: "quick-start", desc: "Ulangi alur dari awal." },
      { title: "Pertanyaan Umum", slug: "faq", desc: "Jawaban singkat umum." },
      { title: "Kontak Support", slug: "kontak", desc: "Minta bantuan bila buntu." },
    ],
  },
  {
    slug: "panduan-photobox-owner",
    title: "Owner: Kelola Outlet dan Booth",
    category: "Owner",
    summary:
      "Buat outlet, buat booth, atur kamera printer timer, dan kelola device pairing sampai revoke.",
    audience: "Owner dan manager",
    estimate: "10 menit",
    prerequisites: [
      "Business sudah dibuat dan plan aktif.",
      "Satu outlet minimal sebelum buat booth.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Outlet adalah lokasi fisik (nama, alamat, kota, provinsi, status active atau inactive). Photobox adalah booth di dalam outlet (nama, slug unik per business, outlet induk, status online, offline, atau maintenance). Satu outlet bisa menampung banyak booth.",
          "Limit plan di enforce server side. Membuat outlet atau booth melebihi max_outlets atau max_photoboxes ditolak. Semua query di scope business id: non member mendapat 404 anti existence leak.",
        ],
      },
      {
        heading: "Kelola outlet",
        paragraphs: [
          "Klik baris outlet untuk analytics: revenue (sum final amount), sessions count, customers distinct, average transaction, dan most popular package (group by package terbanyak).",
        ],
        steps: [
          "Buka Outlets, tekan Buat Outlet. Isi nama wajib, alamat opsional, kota, provinsi.",
          "Klik baris untuk analytics per outlet.",
          "Hapus hanya bila tanpa dependensi photobox, transaksi, atau relasi paket dan voucher. Jika ada, ubah status menjadi inactive.",
        ],
        table: {
          head: ["Field", "Aturan", "Contoh"],
          rows: [
            ["name", "Wajib", "Mall Kota Kasablanka"],
            ["address", "Opsional", "Lantai 2 Blok A"],
            ["city / province", "Opsional", "Jakarta / DKI Jakarta"],
            ["status", "active atau inactive", "active"],
          ],
        },
      },
      {
        heading: "Kelola booth dan device",
        paragraphs: [
          "Pairing memakai kode aktivasi sekali pakai kedaluwarsa sekitar 5 menit. Device kirim kode ke POST /api/v1/public/devices/activate, server verifikasi lalu terbitkan device token persisten (disimpan hash di server, token di localStorage device). Token diverifikasi bersama photobox id dan business id di tiap request.",
          "Device status read only berisi resolusi kamera, status printer, dan last heartbeat. Tombol Ulangi Setup melakukan revoke lalu pairing ulang. Revoke membuat device langsung terkunci.",
        ],
        steps: [
          "Buat photobox: nama, slug lowercase alphanumeric plus dash, outlet induk, status.",
          "Di detail photobox tekan Tampilkan Kode atau QR.",
          "Di device buka /p/[businessSlug]/[photoboxSlug], input kode atau scan QR.",
          "Jalankan setup wizard sekali sampai welcome screen.",
          "Revoke dari daftar device bila device hilang atau rusak.",
        ],
        code: {
          label: "Endpoint device (owner dan publik)",
          lang: "text",
          code: "POST /api/v1/business/:businessId/photoboxes/:id/activation\nPOST /api/v1/public/devices/activate\nPOST /api/v1/public/devices/verify\nDELETE /api/v1/business/:businessId/devices/:id",
        },
      },
      {
        heading: "Kamera, printer, dan timer",
        paragraphs: [
          "Timer mulai saat webhook paid. Semua endpoint sesi mengecek expiry dan mengembalikan SESSION_EXPIRED bila lewat. Countdown kiosk hanya UX, server adalah enforcer.",
          "Timeout sebelum bayar: reset ke Welcome, checkout expired, tidak reuse. Timeout setelah bayar: auto finalize memakai foto terakhir, tetap print dan QR result. Timeout post paid dengan 0 foto: result menampilkan sesi berakhir, penanganan manual owner.",
        ],
        steps: [
          "Atur countdown 1 sampai 60 detik, mirror preview, fullscreen, facingMode, resolusi capture, jpeg quality.",
          "Atur print: enabled, paper 4x6, layout single, portrait, auto print true, copies, margins mm.",
          "Atur timer detik minimal 60, warning lebih kecil dari timer, max retakes (null sama dengan unlimited).",
          "Jalankan print test dan konfirmasi fisik Ya atau Tidak.",
        ],
        code: {
          label: "Contoh settings per booth",
          lang: "json",
          code: '{\n  "camera": { "countdown_seconds": 3, "mirror_preview": true },\n  "print": { "enabled": true, "paper_size": "4x6", "auto_print": true },\n  "session": { "timer_seconds": 300, "warning_seconds": 60 }\n}',
        },
      },
    ],
    troubleshooting: [
      {
        gejala: "Booth tidak muncul di kiosk",
        penyebab: "Device belum pairing atau token di revoke",
        solusi: "Generate kode baru dan pairing ulang.",
      },
      {
        gejala: "SESSION_EXPIRED terus muncul",
        penyebab: "Timer sesi terlalu pendek atau sesi lama dibuka ulang",
        solusi: "Naikkan timer_seconds, mulai sesi baru setelah paid.",
      },
      {
        gejala: "Print test tidak keluar",
        penyebab: "Printer default OS belum di set",
        solusi: "Set printer default di kiosk, ulangi print test.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Template dan Frame",
        slug: "panduan-template",
        desc: "Slot builder dan default booth.",
      },
      {
        title: "Kamera dan Printer Kompatibel",
        slug: "perangkat-kompatibel",
        desc: "Pilih seri yang stabil.",
      },
      { title: "Atasi Masalah Umum", slug: "troubleshooting", desc: "Solusi kamera dan print." },
    ],
  },
  {
    slug: "panduan-template",
    title: "Owner: Template dan Frame",
    category: "Owner",
    summary:
      "Upload frame sendiri, atur slot di builder, pakai undo/redo, duplikat, snap, dan layer teks. Template aktif langsung tampil di semua paket; template default booth dipilih dari photobox.",
    audience: "Owner dan manager",
    estimate: "10 menit",
    prerequisites: [
      "Minimal satu package dengan photo count jelas.",
      "File frame PNG, JPG, atau WebP; PNG paling cocok untuk transparansi.",
      "Akses dashboard owner dengan izin template:write.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Template adalah frame yang menampung foto customer. Dua tipe: template legacy (layout kosong, overlay full canvas, backward compatible) dan template slot (layout canvas plus slots array, foto masuk pas per slot).",
          "Customer melihat semua template aktif, untuk paket mana pun. Frame ber-slot menentukan jumlah capture; template legacy tanpa slot memakai photo_count package. composeFrame dipakai bersama oleh builder preview dan editor kiosk; JPEG final dirender di editor kiosk, lalu print dan result online memakai JPEG itu.",
        ],
      },
      {
        heading: "Upload frame",
        paragraphs: [
          "Desain di Canva, Figma, atau Photoshop, ekspor PNG, JPG, atau WebP. Upload divalidasi tipe, magic byte, dan ukuran di server sebagai trust boundary.",
        ],
        steps: [
          "Buka Templates, tekan Upload.",
          "Isi nama dan kategori: Minimal, Cute, Retro, Y2K, Wedding, Birthday, Graduation, Event, Custom.",
          "Upload file maksimal 5 MB (PNG, JPG, WebP).",
          "Pilih status upload: Draft (nonaktif) atau Publish (aktif).",
        ],
        table: {
          head: ["Aturan", "Nilai", "Keterangan"],
          rows: [
            ["Tipe file", "PNG, JPG, WebP", "PNG transparan disarankan untuk frame"],
            ["Ukuran maks", "5 MB", "Kompres sebelum upload"],
            ["Slot builder", "Maksimal 8", "0 slot = frame penuh legacy"],
          ],
        },
      },
      {
        heading: "Atur slot di builder",
        paragraphs: [
          "Builder canvas: tambah slot manual (drag kotak) atau deteksi area hijau frame menjadi slot mask, atur shape, posisi, ukuran, rotasi, fit, lalu periksa preview foto contoh otomatis. Slot tidak bisa digeser atau resize keluar batas canvas (clamp saat drag).",
          "Urutan render: clear canvas ke resolusi canvas, untuk tiap slot urut z naik clip ke shape lalu drawImage foto dengan fit cover atau contain plus transform zoom atau pan customer, lalu drawImage frame PNG penuh, lalu sticker dan text di atas.",
        ],
        steps: [
          "Pilih preset: 4x6 portrait 1200x1800, 4x6 landscape 1800x1200, 2x6 strip 600x1800, square 1500x1500, custom maks 3000x3000.",
          "Tekan Tambah Slot, drag kotak di canvas.",
          "Atur shape (rect, rounded, circle, ellipse), x, y, width, height, rotation -180 sampai 180, radius, fit, z.",
          "Periksa preview kanvas, pastikan foto contoh pas tanpa distorsi.",
          "Simpan Draft (nonaktif) atau Publish (aktif). Maksimal 8 slot; 0 slot berarti frame penuh legacy.",
        ],
        note: "Validasi server: id slot unik; z unik dan berurutan 0..n-1; preset cocok dengan dimensi canvas; posisi dan ukuran slot (rotation-aware) di dalam batas canvas; radius maksimal setengah sisi terpendek; circle wajib berbentuk persegi; nilai crop 0..1.",
      },
      {
        heading: "Template otomatis tersedia di semua paket",
        paragraphs: [
          "Tidak ada lagi langkah assign template ke paket. Setiap template yang aktif langsung tampil di semua paket dan semua booth, sehingga customer selalu bisa memilih frame yang Anda publish.",
          "Jumlah foto tetap mengikuti frame: frame ber-slot menentukan berapa foto diambil, dan slot yang lebih banyak dari isi paket diisi bergiliran. Kolom Jumlah foto cadangan di form paket hanya dipakai frame lama tanpa slot atau pilihan Tanpa frame.",
        ],
        steps: [
          "Buka Templates, upload atau aktifkan frame yang ingin dipakai.",
          "Buka Packages, isi harga dan jumlah cetak. Biarkan Jumlah foto cadangan apa adanya bila semua frame Anda ber-slot.",
          "Uji dari kiosk: pilih paket, bayar, pastikan frame muncul di layar pilih frame.",
        ],
      },
      {
        heading: "Undo dan redo",
        paragraphs: [
          "Setiap perubahan layout bisa dibatalkan. Riwayat menyimpan sampai 100 langkah, dan satu kali geser dihitung satu langkah meskipun pointer bergerak puluhan kali.",
          "Gunakan tombol Undo dan Redo di builder, atau pintasan Ctrl+Z dan Shift+Ctrl+Z. Di Mac, gunakan Cmd+Z dan Shift+Cmd+Z. Saat kursor berada di kolom isian, pintasan itu tetap dipakai untuk membatalkan ketikan, bukan layout.",
        ],
        note: "Riwayat tidak disimpan. Menutup atau memuat ulang halaman builder mengosongkan riwayat, jadi simpan draft sebelum berpindah halaman.",
      },
      {
        heading: "Duplikat slot dan template",
        paragraphs: [
          "Duplikat berguna untuk membuat variasi tanpa mengulang dari nol, dan ada dua tingkat: slot dan template.",
        ],
        table: {
          head: ["Duplikat", "Hasil", "Catatan"],
          rows: [
            [
              "Slot",
              "Slot baru dengan bentuk, ukuran, rotasi, dan teks yang sama",
              "Bisa dibatalkan dengan Undo",
            ],
            [
              "Template",
              "Template baru milik Anda berisi layout dan file frame yang sama",
              "Membuka builder template baru",
            ],
          ],
        },
        steps: [
          "Pilih slot, lalu tekan Duplikat di panel properti.",
          "Atau tekan Duplikat template untuk membuat salinan seluruh template.",
          "Sesuaikan salinan, lalu simpan sebagai draft atau publish.",
        ],
      },
      {
        heading: "Snap saat menggeser slot",
        paragraphs: [
          "Saat satu slot digeser, tepi dan titik tengahnya menempel pada tepi dan titik tengah kanvas serta slot lain. Garis bantu muncul sebagai penanda, lalu hilang saat geser selesai.",
          "Snap hanya berlaku untuk satu slot. Menggeser beberapa slot sekaligus tidak menempel, supaya seluruh grup tidak melompat tanpa alasan yang terlihat.",
        ],
      },
      {
        heading: "Layer teks",
        paragraphs: [
          "Setiap slot bisa membawa teks, misalnya nama event atau tahun. Teks digambar di atas frame pada hasil akhir, jadi tidak terpotong lubang foto dan tidak tertutup gambar frame.",
          "Atur jenis font, ketebalan, ukuran, jarak baris, jarak huruf, warna, latar, dan perataan. Mengosongkan teks akan menyembunyikannya, dan template tanpa teks tetap identik dengan template sebelum fitur ini ada.",
        ],
        steps: [
          "Pilih slot, buka panel Layer teks.",
          "Tulis teks, maksimal 2000 karakter.",
          "Atur font, ukuran, warna, dan perataan.",
          "Periksa preview, lalu simpan.",
        ],
      },
      {
        heading: "Template default booth",
        paragraphs: [
          "Booth bisa punya satu template default. Kiosk memilih template itu otomatis bila template tersebut masih ditawarkan untuk paket yang dibeli tamu. Bila tidak lagi cocok, tamu memilih sendiri dari template yang tersedia, atau langsung terpilih bila hanya ada satu.",
          "Template default tidak memaksa tamu memakai template tertentu. Ia hanya menang saat memang tersedia, jadi aman dipakai untuk menyamakan tampilan antar booth.",
        ],
        steps: [
          "Buka halaman hardware booth.",
          "Pilih template default dari daftar template yang boleh dipakai business Anda.",
          "Simpan, lalu uji dari kiosk dengan paket yang berbeda.",
        ],
        note: "Hanya template aktif milik Anda, atau template platform yang sudah dibeli, yang bisa dijadikan default. Selain itu simpan ditolak.",
      },
    ],
    troubleshooting: [
      {
        gejala: "Frame punya slot lebih banyak daripada jumlah foto paket",
        penyebab:
          "Jumlah capture mengikuti slot frame; package photo_count hanya fallback template legacy",
        solusi:
          "Tidak perlu diubah. Slot sisa terisi foto secara bergiliran. Ubah jumlah foto hanya bila paket memang harus menambah capture.",
      },
      {
        gejala: "Hasil print beda dari preview",
        penyebab: "Template diedit setelah kiosk memuatnya untuk sesi berjalan",
        solusi:
          "Kiosk memakai template yang dimuat saat sesi berjalan. Muat ulang booth agar versi baru terambil, lalu ulangi sesi.",
      },
      {
        gejala: "Upload ditolak",
        penyebab: "Tipe atau ukuran file di luar aturan",
        solusi: "Ekspor ulang PNG atau JPG di bawah 5 MB.",
      },
      {
        gejala: "Undo tidak mengembalikan perubahan",
        penyebab: "Riwayat kosong karena halaman baru dimuat ulang",
        solusi:
          "Riwayat hanya berlaku selama halaman terbuka; ulangi perubahan atau muat draft tersimpan.",
      },
      {
        gejala: "Teks tidak terlihat di hasil",
        penyebab: "Teks dikosongkan, atau slot tidak dipilih saat mengisi panel",
        solusi: "Pilih slot, isi teks, lalu simpan dan periksa preview.",
      },
      {
        gejala: "Template default tidak terpilih di kiosk",
        penyebab: "Template tidak ditawarkan untuk paket itu, atau sudah nonaktif",
        solusi:
          "Pastikan template aktif. Semua template aktif tampil di semua paket, jadi tidak ada assignment yang perlu diatur.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Dari Daftar sampai Booth Live",
        slug: "panduan-owner-mulai",
        desc: "Urut setup lengkap.",
      },
      { title: "Owner: Voucher Promo", slug: "panduan-voucher", desc: "Promo paket dan frame." },
      { title: "Alur Foto Customer", slug: "panduan-photobox", desc: "Lihat dari sisi customer." },
    ],
  },
  {
    slug: "panduan-voucher",
    title: "Owner: Voucher Promo",
    category: "Owner",
    summary: "Buat kode diskon percentage atau fixed, batasi pemakaian, dan baca performanya.",
    audience: "Owner dan manager",
    estimate: "8 menit",
    prerequisites: ["Minimal satu package aktif untuk eligibility."],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Voucher memberi diskon di checkout sebelum paid. Diskon tercatat di checkout session, payments, dan transactions. Kode unik per business huruf besar plus angka.",
          "Frontend hanya display. Backend validasi ulang semuanya dan menghitung final amount sebagai source of truth: final sama dengan harga paket plus pricing yang berlaku minus diskon voucher valid.",
        ],
      },
      {
        heading: "Buat voucher",
        paragraphs: [
          "Dua tipe: percentage (1 sampai 100 persen, capped by max discount) dan fixed (nominal IDR flat, capped by gross). Bisa dibatasi periode, usage limit total, per customer, minimum transaksi, maximum diskon, dan paket atau outlet tertentu.",
        ],
        steps: [
          "Tekan Buat Voucher.",
          "Pilih tipe percentage atau fixed, isi amount.",
          "Isi periode start dan end, usage limit, usage per customer, minimum transaksi, maximum diskon.",
          "Assign ke paket dan outlet bila promo terbatas. Kosong berarti semua.",
          "Aktifkan toggle is active.",
        ],
        table: {
          head: ["Field", "Aturan", "Contoh"],
          rows: [
            ["code", "Unik per business, uppercase", "GRANDOPENING20"],
            ["type", "percentage atau fixed", "percentage"],
            ["amount", "1-100 untuk persen, di atas nol untuk fixed", "20"],
            ["min_transaction", "Di atas atau sama dengan nol", "30000"],
            ["max_discount", "Null atau di atas nol", "10000"],
          ],
        },
      },
      {
        heading: "Validasi saat dipakai",
        paragraphs: [
          "Customer input kode ke POST apply voucher. Server cek: voucher ada, business cocok, is active true, tanggal berlaku, usage limit total, usage per customer, min transaction, package eligibility, outlet eligibility.",
          "Voucher 100 persen membuat payment paid sintetik tanpa gateway. Voucher parsial kembali ke method picker untuk melunasi sisa. Saat webhook paid, ada TOCTOU re-check kuota: bila over limit, log warning tanpa rollback karena payment sudah settled, lalu insert voucher usages.",
        ],
      },
      {
        heading: "Baca performa",
        paragraphs: [
          "Buka baris voucher untuk total usage (count voucher usages), total diskon (sum discount amount), revenue generated (sum final amount transaksi yang memakai voucher), serta active dan expired count.",
        ],
        steps: [
          "Buka baris voucher untuk angka usage dan diskon.",
          "Bandingkan active dan expired untuk keputusan perpanjang.",
          "Periksa usages per customer bila curiga abuse, lalu turunkan limit atau persempit eligibility.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Voucher invalid atau expired",
        penyebab: "Nonaktif, di luar periode, limit habis, atau tidak eligible",
        solusi: "Cek toggle, tanggal, limit, min transaction, dan assign paket atau outlet.",
      },
      {
        gejala: "Diskon lebih kecil dari harapan",
        penyebab: "Terkena cap max discount atau min transaction",
        solusi: "Naikkan max discount atau turunkan min transaction.",
      },
      {
        gejala: "Voucher bisa dipakai berlebih",
        penyebab: "Race pemakaian bersamaan",
        solusi: "TOCTOU re-check mencatat warning. Ketatkan limit dan pantau usages.",
      },
    ],
    nextSteps: [
      { title: "Cara Bayar di Kiosk", slug: "panduan-qris", desc: "Sisi customer pakai voucher." },
      {
        title: "Owner: Keuangan dan Laporan",
        slug: "panduan-finance-laporan",
        desc: "Baca revenue voucher.",
      },
      { title: "Owner: Baca Dashboard", slug: "panduan-dashboard", desc: "Lihat dampak promo." },
    ],
  },
  {
    slug: "panduan-dashboard",
    title: "Owner: Baca Dashboard dan Analytics",
    category: "Owner",
    summary:
      "Cara membaca revenue, filter tanggal, dan breakdown per outlet, paket, booth, dan metode bayar.",
    audience: "Owner dan manager",
    estimate: "8 menit",
    prerequisites: ["Minimal satu transaksi paid agar metrik terisi."],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Dashboard adalah server component yang membaca transactions paid milik business Anda. Semua query di scope business id, tidak ada data lintas tenant.",
          "Uang selalu integer Rupiah. Gross adalah total sebelum diskon (sum final amount? tepatnya gross), discount adalah total voucher terpakai dan tidak dihitung sebagai revenue, net adalah gross minus discount. Average transaction adalah net dibagi count paid, dibulatkan integer.",
        ],
      },
      {
        heading: "Metrik utama",
        paragraphs: [
          "Halaman Dashboard menampilkan revenue today, revenue month, gross, net, total sessions, paid transactions, total customers, average transaction, active photoboxes (status online), dan active outlets (status active).",
        ],
        steps: [
          "Buka Dashboard untuk kartu metrik dan chart revenue.",
          "Baca active photoboxes dan outlets untuk status operasional.",
          "Jika kosong: periksa filter tanggal dan pastikan ada transaksi paid. Pending, failed, expired tidak masuk revenue.",
        ],
        table: {
          head: ["Metrik", "Sumber", "Catatan"],
          rows: [
            ["Gross Revenue", "sum transactions (paid)", "Sebelum diskon"],
            ["Discount", "sum discount amount", "Tidak dihitung revenue"],
            ["Net Revenue", "gross minus discount", "Angka masuk bisnis"],
            ["Avg Transaction", "net dibagi count paid", "Integer Rupiah"],
          ],
        },
      },
      {
        heading: "Analytics dan breakdown",
        paragraphs: [
          "Halaman Analytics menyediakan breakdown per hari, outlet, package, photobox, dan metode pembayaran. Semua agregasi dari transactions, sehingga POS otomatis masuk laporan begitu insert ke transactions.",
        ],
        steps: [
          "Buka Analytics.",
          "Pilih rentang: Today, 7 hari, 30 hari, bulan ini, bulan lalu, tahun ini, custom.",
          "Ganti breakdown: by day, by outlet, by package, by photobox, by payment method.",
          "Samakan angka dengan Metrics dan Transactions.",
        ],
      },
      {
        heading: "Customers",
        paragraphs: [
          "Halaman Customers menampilkan nama, phone, email, total spending (sum final amount per customer), session history, transaction history, dan booking history. Search mendukung nama, phone, email. Klik baris untuk detail tab transaksi, sesi, booking.",
        ],
        steps: [
          "Buka Customers.",
          "Gunakan search untuk nama, phone, atau email.",
          "Klik baris untuk riwayat lengkap dan total spending.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Angka dashboard nol",
        penyebab: "Belum ada transaksi paid di rentang itu",
        solusi: "Longgarkan filter tanggal, cek status paid.",
      },
      {
        gejala: "Analytics beda dengan dashboard",
        penyebab: "Rentang atau breakdown berbeda",
        solusi: "Samakan from dan to, bandingkan agregasi yang sama.",
      },
      {
        gejala: "Customer tidak ketemu",
        penyebab: "Search terlalu spesifik atau data null",
        solusi: "Cari sebagian nama, phone, atau email.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Keuangan dan Laporan",
        slug: "panduan-finance-laporan",
        desc: "Expense, profit, export.",
      },
      { title: "Owner: Voucher Promo", slug: "panduan-voucher", desc: "Baca revenue voucher." },
      {
        title: "Owner: Kelola Outlet dan Booth",
        slug: "panduan-photobox-owner",
        desc: "Cek per outlet.",
      },
    ],
  },
  {
    slug: "panduan-staff-pos",
    title: "Owner: Staff dan POS Kasir",
    category: "Owner",
    summary:
      "Undang staff dengan role yang tepat dan jalankan POS offline cash per booth untuk merchandise.",
    audience: "Owner dan manager",
    estimate: "10 menit",
    prerequisites: [
      "Plan dengan slot staff tersedia (Growth 5, Business 20).",
      "Add on POS aktif untuk entitlement kasir.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Role business: owner akses penuh, manager hampir semua kecuali staff write dan billing, staff read only operasional. Permission dicek server side dengan fungsi can. Sembunyikan menu hanya UX, bukan pengaman.",
          "POS adalah add on ber entitlement per booth dengan flag photoboxes pos enabled. Pembayaran POS offline only: cash, bank transfer, atau other. Tanpa integrasi payments, webhook provider, atau creditBalance.",
        ],
      },
      {
        heading: "Undang dan atur staff",
        paragraphs: [
          "Invite mencari user by email, buat user active bila belum ada, lalu insert business members. Update dan revoke memakai composite business id plus user id. Role owner tidak bisa diubah atau di revoke orang lain.",
        ],
        steps: [
          "Buka Staff, tekan Undang Staff. Isi email dan role.",
          "Cek limit max staff: Starter 0, Growth 5, Business 20.",
          "Ubah role atau revoke dari baris staff sesuai kebutuhan.",
        ],
        table: {
          head: ["Role", "Akses", "Batasan"],
          rows: [
            ["owner", "Penuh", "Tidak bisa diubah atau revoke oleh lain"],
            ["manager", "Hampir semua", "Tanpa staff write dan billing"],
            ["staff", "Read only operasional", "Tanpa finance detail dan settings"],
          ],
        },
      },
      {
        heading: "Aktifkan POS",
        paragraphs: [
          "POS dijual sebagai baris add ons code pos unit feature. Harga dibaca server dari add ons dan bisa diubah admin via UI tanpa deploy. Owner beli via subscription invoice QRIS, lalu apply intent upsert subscription add ons.",
          "Gate di tiga lapis: layout POS redirect bila tidak berhak, tiap server action dan API throw POS NOT SUBSCRIBED, dan halaman aktivasi owner. Sidebar hanya render menu POS bila entitlement aktif dan role punya permission.",
        ],
        steps: [
          "Beli add on POS via subscription invoice QRIS sampai entitlement aktif.",
          "Aktifkan pos enabled per booth yang boleh jualan.",
          "Pastikan staff punya permission pos sell dan pos read.",
        ],
      },
      {
        heading: "Jalankan kasir",
        paragraphs: [
          "Katalog pos products per tenant: nama, SKU nullable unik per business, kategori text (keychain, gantungan, additional print, merchandise, lainnya), harga integer di atas nol, cost opsional untuk margin, stock nullable (null sama dengan tidak di track), image url eksternal.",
          "Order: client hanya kirim product id plus qty. Server fetch ulang produk by id dan business id, hitung subtotal dan total, simpan snapshot di pos order items agar perubahan harga tidak mengubah riwayat. Stock decrement memakai guarded UPDATE stock sama dengan stock minus qty where stock di atas sama dengan qty.",
        ],
        steps: [
          "Owner atau manager buat katalog produk dan harga.",
          "Staff buka terminal POS, tambah item ke cart (qty, hapus, subtotal, total).",
          "Buat order pending dengan snapshot harga.",
          "Terima cash atau transfer offline. Order paid insert ke transactions untuk reporting tanpa kredit saldo.",
        ],
      },
      {
        heading: "Uang tunai dan kembalian",
        paragraphs: [
          "Saat menerima tunai, kasir mengisi uang yang diterima. Server yang menghitung kembalian, bukan layar kasir, dan hasilnya tersimpan bersama order sehingga riwayat tidak bisa berbeda dengan struk.",
          "Bila uang yang diisi kurang dari total, order ditolak dengan pesan yang menyebut total dan jumlah yang diterima. Untuk transfer atau pembayaran lain, kolom uang diterima boleh kosong.",
        ],
        steps: [
          "Tekan Bayar Tunai di terminal.",
          "Isi uang yang diterima dari pelanggan.",
          "Periksa kembalian yang tampil sebelum menyerahkan uang.",
          "Selesaikan order, lalu cetak atau serahkan struk.",
        ],
        table: {
          head: ["Kolom", "Isi", "Catatan"],
          rows: [
            ["Total", "dihitung server", "Tidak bisa diubah dari terminal"],
            ["Uang diterima", "diisi kasir", "Wajib minimal sama dengan total"],
            ["Kembalian", "dihitung server", "Tersimpan bersama order"],
          ],
        },
      },
      {
        heading: "Cetak struk: 58 atau 80 mm",
        paragraphs: [
          "Struk punya jalur cetak sendiri, terpisah dari cetak foto. Tiga pilihan transport: dialog sistem, CUPS lewat bridge lokal, atau thermal lewat Bluetooth.",
          "Lebar kertas hanya dua: 58 mm dan 80 mm. Pada 58 mm struk memuat 32 kolom, pada 80 mm 48 kolom. Nama produk yang terlalu panjang dipotong dengan elipsis, bukan dibungkus, jadi jaga nama produk tetap pendek.",
        ],
        steps: [
          "Pastikan owner sudah mengaktifkan jalur struk di halaman hardware booth.",
          "Selesaikan pembayaran.",
          "Tekan Cetak pada layar struk, atau biarkan cetak otomatis bila diaktifkan.",
          "Periksa kertas keluar. Pesan terkirim belum berarti kertas tercetak.",
        ],
        note: "Jalur dan lebar kertas disalin ke order saat order dibuat. Mengganti printer setelahnya tidak mengubah struk lama.",
      },
    ],
    troubleshooting: [
      {
        gejala: "POS_NOT_SUBSCRIBED",
        penyebab: "Add on POS belum aktif",
        solusi: "Selesaikan invoice add on POS sampai entitlement aktif.",
      },
      {
        gejala: "INSUFFICIENT_STOCK",
        penyebab: "Race dua kasir untuk stok terakhir",
        solusi: "Kurangi qty atau restock produk.",
      },
      {
        gejala: "Staff tidak melihat menu POS",
        penyebab: "Tanpa permission atau tanpa entitlement",
        solusi: "Cek role dan pos enabled per booth.",
      },
      {
        gejala: "Uang diterima kurang dari total",
        penyebab: "Nominal tunai yang diisi di bawah total order",
        solusi: "Isi ulang sesuai total, atau ubah item di cart sebelum membayar.",
      },
      {
        gejala: "Struk terpotong",
        penyebab: "Lebar kertas tidak cocok dengan printer",
        solusi: "Samakan pilihan 58 atau 80 mm di setelan hardware booth.",
      },
      {
        gejala: "Tombol cetak tidak muncul",
        penyebab: "Jalur struk dimatikan owner untuk booth itu",
        solusi: "Minta owner mengaktifkan jalur struk di halaman hardware.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Keuangan dan Laporan",
        slug: "panduan-finance-laporan",
        desc: "POS masuk transactions.",
      },
      {
        title: "Owner: Dari Daftar sampai Booth Live",
        slug: "panduan-owner-mulai",
        desc: "Urut setup.",
      },
      { title: "Pertanyaan Umum", slug: "faq", desc: "Jawaban cepat." },
    ],
  },
  {
    slug: "panduan-finance-laporan",
    title: "Owner: Keuangan dan Laporan",
    category: "Owner",
    summary: "Catat expense, baca profit, export CSV dan XLSX, dan atur retention serta checkout.",
    audience: "Owner dan manager",
    estimate: "10 menit",
    prerequisites: [
      "Transaksi paid tersedia untuk dibaca.",
      "Kategori expense disepakati internal.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Transactions adalah source of truth financial reporting. Payments adalah detail settlement. Setiap payment paid otomatis membuat transaction paid. POS otomatis masuk laporan karena insert ke transactions yang sama.",
          "Transaksi manual (cash, bank transfer, other) dan offline dicatat untuk reporting tetapi tidak mengisi saldo. Saldo hanya dari QRIS via creditBalance. Kebijakan ini konsisten sejak migration 0016.",
        ],
      },
      {
        heading: "Transaksi dan finance",
        paragraphs: [
          "Tabel transactions berisi transaction number, tanggal paid at, customer (nama atau strip), package, outlet, photobox, payment method (qris, cash, bank transfer, other, offline), gross, discount, final, dan status badge. Status enum: pending, paid, failed, cancelled, refunded.",
          "Finance menghitung: Net Revenue sama dengan sum final amount paid. Expenses sama dengan sum expenses amount. Estimated Profit sama dengan Net minus Expenses. Profit Margin sama dengan Profit dibagi Net kali 100.",
        ],
        steps: [
          "Buka Transactions. Filter date range, outlet, photobox, package, method, status.",
          "Search nomor transaksi, nama, phone, atau email customer.",
          "Klik baris untuk detail gross, discount, final, voucher, paid at.",
          "Untuk tunai di luar kiosk: tekan Catat Transaksi Manual, isi outlet, photobox, package, method, amount, note. Sistem insert paid plus audit log tanpa creditBalance.",
          "Buka Finance untuk gross, discounts, net, expenses, profit, margin.",
          "Tekan Tambah Pengeluaran: name, amount integer di atas nol, kategori, tanggal, outlet opsional, note.",
        ],
        table: {
          head: ["Kategori expense", "Contoh", "Catatan"],
          rows: [
            ["Sewa dan utilitas", "Rent, Electricity, Internet", "Rutin bulanan"],
            ["Operasional cetak", "Paper, Ink", "Ikuti volume cetak"],
            ["SDM dan perawatan", "Staff, Maintenance, Equipment", "Per outlet bila perlu"],
            ["Pemasaran dan lain", "Advertising, Other operational", "Untuk hitung margin bersih"],
          ],
        },
      },
      {
        heading: "Export dan pengaturan",
        paragraphs: [
          "Reports via REST download: GET /api/v1/business/[businessId]/reports dengan type, from, to, format csv atau xlsx. CSV mengikuti RFC4180 dengan formula injection guard. XLSX via ExcelJS. Response attachment untuk download browser.",
          "Retention days 1 sampai 3 di Settings. Cron retention menghapus media hasil setelah cutoff, baris transactions dan sessions dipertahankan. Checkout settings: qris expiry minutes 1 sampai 60 default 3, offline enabled boolean default false (opt in server gated, payment method offline non withdrawable).",
        ],
        steps: [
          "Buka Reports, pilih tipe: daily, weekly, monthly, revenue, transactions, outlet, photobox, expenses, voucher.",
          "Pilih format CSV atau XLSX, lalu unduh.",
          "Atur retention days di Settings.",
          "Atur checkout expiry dan offline enabled di Settings Checkout.",
        ],
        code: {
          label: "Contoh download laporan",
          lang: "text",
          code: "GET /api/v1/business/[businessId]/reports?type=transactions&from=2026-09-01&to=2026-09-30&format=csv",
        },
      },
    ],
    troubleshooting: [
      {
        gejala: "Export kosong",
        penyebab: "Filter tanggal tanpa transaksi paid",
        solusi: "Longgarkan rentang, cek status paid.",
      },
      {
        gejala: "Profit terlihat minus",
        penyebab: "Expense lebih besar dari net periode itu",
        solusi: "Cek expense per kategori dan tanggal input.",
      },
      {
        gejala: "Transaksi manual tidak menambah saldo",
        penyebab: "By design: manual reporting only",
        solusi: "Tidak perlu aksi. Saldo hanya dari QRIS.",
      },
    ],
    nextSteps: [
      { title: "Owner: Baca Dashboard", slug: "panduan-dashboard", desc: "Samakan angka." },
      {
        title: "Owner: Staff dan POS Kasir",
        slug: "panduan-staff-pos",
        desc: "POS masuk laporan.",
      },
      {
        title: "Kamera dan Printer Kompatibel",
        slug: "perangkat-kompatibel",
        desc: "Lengkapi operasional.",
      },
    ],
  },
  {
    slug: "panduan-qris",
    title: "Cara Bayar di Kiosk",
    category: "Pembayaran",
    summary:
      "QRIS, voucher, dan tunai. Termasuk cara baca total, masa berlaku QR, dan apa yang terjadi saat reload.",
    audience: "Customer dan operator booth",
    estimate: "6 menit",
    prerequisites: ["Paket sudah dipilih dan order summary tampil."],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Kiosk mendukung QRIS via gateway merchant owner: Tripay atau Midtrans. Dana masuk langsung ke rekening owner, bukan ke perantara. Kiosk menampilkan metode dari credential direct aktif: QRIS, VA, dan metode redirect yang didukung adapter.",
          "Bila booth belum mengaktifkan credential gateway, kiosk hanya menawarkan voucher dan tunai. Ini normal dan bukan error. Semua nominal Rupiah integer. Backend menghitung ulang total, frontend tidak pernah dipercaya untuk harga.",
        ],
      },
      {
        heading: "Bayar dengan QRIS",
        paragraphs: [
          "Setelah tekan Bayar dengan QRIS, backend membuat transaksi provider lalu menampilkan QR beserta total yang harus dibayar. Tripay closed payment mengembalikan merchant ref, reference, amount, qr string, checkout URL, dan expired time. Tampilkan total yang harus dibayar ke pembeli.",
          "Verifikasi memakai webhook plus polling. Webhook Tripay memakai signature HMAC SHA256 dari raw body dengan private key, lalu status diverifikasi server to server sebelum paid. Kiosk polling tiap 3 detik. Satu booth hanya punya satu QR hidup: checkout baru menghanguskan checkout open plus payment creating atau pending sebelumnya. Payment pending yang masih hidup dicek dulu ke provider: bila ternyata sudah dibayar maka transisi paid, bukan di void. QR yang sudah di void tapi tetap dibayar tetap diakui paid bila amount valid.",
        ],
        steps: [
          "Tekan Bayar dengan QRIS.",
          "Scan kode dan bayar sebesar total yang tampil termasuk kode unik.",
          "Perhatikan timer kedaluwarsa di bawah QR. Default 3 menit, rentang setting 1 sampai 60 menit. Efektif memakai yang tercepat antara setting booth dan provider.",
          "Tunggu status paid. Jangan tutup halaman.",
          "Jika reload atau putus: status dipulihkan dari server via payment reference.",
        ],
        table: {
          head: ["Provider", "Metode kiosk", "Verifikasi webhook"],
          rows: [
            [
              "Midtrans",
              "QRIS, GoPay, ShopeePay, VA",
              "SHA512 order id plus status code plus gross amount plus server key",
            ],
            ["Tripay", "QRIS, VA, gerai retail", "HMAC SHA256 raw body via private key"],
          ],
        },
      },
      {
        heading: "Pakai voucher",
        paragraphs: [
          "Masukkan kode huruf besar lalu Apply. Valid menampilkan voucher applied plus diskon. Invalid menampilkan invalid atau expired.",
          "Validasi server: voucher ada, business cocok, active true, tanggal berlaku, usage limit total, usage per customer, min transaction, max discount, package eligibility, outlet eligibility. Voucher 100 persen membuat payment paid sintetik tanpa gateway. Voucher parsial kembali ke method picker untuk sisa.",
        ],
        steps: [
          "Masukkan kode voucher, tekan Apply.",
          "Periksa diskon dan total akhir.",
          "Lunasi sisa bila voucher parsial.",
        ],
      },
      {
        heading: "Bayar tunai",
        paragraphs: [
          "Pilih Tunai dan serahkan uang ke operator. Kiosk membuat payment pending yang menunggu konfirmasi operator terautentikasi. Customer tidak bisa self confirm. Hanya operator dengan sesi login plus membership payment confirm yang bisa mengonfirmasi.",
          "Transaksi tunai tercatat untuk reporting tetapi tidak mengkredit saldo owner. Saldo hanya dari QRIS. Nominal final dihitung server (gross minus diskon) dan tidak bisa dimanipulasi dari browser.",
        ],
        steps: [
          "Pilih Tunai.",
          "Serahkan uang ke operator.",
          "Tunggu operator konfirmasi sampai status paid.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "QRIS tidak tampil",
        penyebab: "Koneksi putus atau tanpa credential aktif",
        solusi:
          "Cek internet kiosk, reload (status dipulihkan otomatis), atau pakai tunai lalu catat manual.",
      },
      {
        gejala: "Sudah bayar tapi pending",
        penyebab: "Webhook tertunda",
        solusi: "Tunggu polling dan webhook. Jangan buat QR baru bila QR masih hidup.",
      },
      {
        gejala: "QR expired",
        penyebab: "Melewati expiry provider atau setting",
        solusi: "Buat payment baru. Jangan reuse transaksi lama bila provider mensyaratkan baru.",
      },
      {
        gejala: "RATE_LIMITED 429",
        penyebab: "Tombol bayar ditekan berulang",
        solusi: "Ikuti retry after di response, kunci tombol sampai waktu habis.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Atur QRIS dan Credential",
        slug: "panduan-payment-setup",
        desc: "Aktifkan gateway merchant.",
      },
      { title: "Alur Foto Customer", slug: "panduan-photobox", desc: "Lanjut setelah paid." },
      { title: "Hasil Foto Online", slug: "hasil-foto", desc: "Unduh setelah finalize." },
    ],
  },
  {
    slug: "panduan-payment-setup",
    title: "Owner: Atur QRIS dan Credential",
    category: "Owner",
    summary: "Pasang gateway merchant sendiri agar dana kiosk masuk langsung ke rekening Anda.",
    audience: "Owner",
    estimate: "10 menit",
    prerequisites: [
      "Akun merchant Tripay atau Midtrans.",
      "Server key dan merchant id siap disalin.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Model dana direct merchant: customer membayar ke project merchant owner. Aggregator platform untuk kiosk dihapus: tanpa credential aktif, kiosk hanya voucher dan tunai. Invoice subscription platform dibayar via Tripay memakai credential platform di env TRIPAY_*.",
          "Credential disimpan di tabel payment credentials per business, bukan env. Server key dienkripsi AES 256 GCM di app layer. Webhook aktif untuk Midtrans dan Tripay dengan verifikasi signature lalu status server to server sebelum settlement. Lookup webhook hanya memakai order id atau merchant ref terhadap payments order id: business, provider, credential, dan payment id dari webhook tidak dipercaya.",
        ],
      },
      {
        heading: "Tambah credential",
        paragraphs: [
          "Unique per business, provider, dan environment. Kiosk memilih provider dari credential aktif terbaru per provider plus environment. Direct merchant memakai transitionPaymentToPaid dan runPaidSideEffects: transaction payment method qris, tanpa creditBalance, platform fee menjadi receivable idempotent. Invoice subscription memakai gateway platform Tripay, bukan credential tenant.",
        ],
        steps: [
          "Buka Settings Payment, tekan Tambah Payment Gateway.",
          "Pilih provider Tripay atau Midtrans.",
          "Isi label, merchant id, server key, client key bila ada, environment sandbox atau production.",
          "Tekan Test untuk cek koneksi, lalu aktifkan toggle is active.",
        ],
        table: {
          head: ["Provider", "Field wajib", "Webhook route"],
          rows: [
            [
              "Midtrans",
              "merchant id, server key, client key",
              "POST /api/webhooks/payment/midtrans",
            ],
            ["Tripay", "merchant code, api key, private key", "POST /api/webhooks/payment/tripay"],
          ],
        },
      },
      {
        heading: "Atur expiry dan fallback",
        paragraphs: [
          "QRIS expiry owner configurable via business settings checkout qris expiry minutes: default 3, rentang 1 sampai 60, dari dashboard Settings. Expiry efektif sama dengan min expiry provider dan setting. Selama QR hidup, customer tidak bisa membuat QR baru: satu satunya jalan kembali ke halaman package (QR lama otomatis hangus).",
          "Tanpa credential direct aktif, kiosk otomatis hanya voucher dan tunai. Jelaskan ke operator agar tidak dianggap error. Voucher 100 persen sama dengan paid sintetik. Tunai sama dengan pending menunggu operator server gated non withdrawable.",
        ],
        steps: [
          "Atur qris expiry minutes di Settings Checkout.",
          "Uji QR hidup dan kedaluwarsa di kiosk.",
          "Siapkan SOP tunai untuk fallback.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Test credential gagal",
        penyebab: "Key salah, environment salah, atau project belum live",
        solusi: "Salin ulang key, samakan sandbox vs production, cek dashboard provider.",
      },
      {
        gejala: "Webhook 401",
        penyebab: "Signature tidak valid (fail closed)",
        solusi: "Samakan private key/signature di provider dan credential.",
      },
      {
        gejala: "Amount mismatch, paid ditolak",
        penyebab: "Nominal provider tidak sama dengan final amount",
        solusi: "Jangan ubah harga saat QR hidup. Buat payment baru.",
      },
    ],
    nextSteps: [
      { title: "Cara Bayar di Kiosk", slug: "panduan-qris", desc: "Uji dari sisi customer." },
      {
        title: "Owner: Keuangan dan Laporan",
        slug: "panduan-finance-laporan",
        desc: "Baca settlement.",
      },
      {
        title: "Owner: Dari Daftar sampai Booth Live",
        slug: "panduan-owner-mulai",
        desc: "Urut setup.",
      },
    ],
  },
  {
    slug: "perangkat-kompatibel",
    title: "Kamera dan Printer Kompatibel",
    category: "Perangkat",
    summary:
      "Daftar seri kamera dan printer yang didukung, cara memilih, dan arti status kompatibilitas.",
    audience: "Owner dan operator booth",
    estimate: "6 menit",
    prerequisites: ["Akses Chrome kiosk dan permission kamera."],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Target utama tablet Android/iOS sebagai PWA dengan kamera internal: buka link kiosk di Chrome atau Safari lalu Add to Home Screen.",
          "Printer memakai browser print dan printer default OS (window print plus media print). Browser tidak bisa enumerate printer, jadi verifikasi memakai print test fisik dan status di device status.",
        ],
      },
      {
        heading: "Kamera",
        paragraphs: [
          "Kamera internal tablet/PWA dipakai langsung, tanpa kabel USB. Rekomendasi minimum 720p, ideal 1080p. Deteksi, grant permission, dan pemilihan device terjadi di setup wizard sekali, bukan di flow customer. Runtime memakai preferred device id tersimpan. Error runtime tetap ditangani pesan retry dan dilaporkan ke device status.",
        ],
        steps: [
          "Kamera depan (selfie) untuk phone, kamera belakang untuk tablet kiosk: bisa diubah dari pengaturan kamera.",
        ],
      },
      {
        heading: "Seri printer",
        paragraphs: [
          "Printer default OS harus di set di kiosk sebelum booth melayani customer. Print layout: 1 foto 4x6 atau 2 strip 2x6 dari satu kertas 4x6. Print count menentukan loop cetak. Package tanpa print langsung ke result.",
        ],
        steps: [
          "Inkjet standar: Epson L Series, Canon, HP, Brother via Windows spooler 4x6 dan A4.",
          "Dye sub cutter internal: DNP DS Series, HiTi P Series, Canon Selphy untuk auto cut 4x6 dan 6x8.",
          "Set printer default OS di device kiosk.",
          "Jalankan print test dari setup wizard atau dashboard, konfirmasi fisik Ya atau Tidak.",
        ],
        table: {
          head: ["Jenis", "Contoh", "Ukuran", "Catatan"],
          rows: [
            ["Inkjet", "Epson L Series, Canon, HP, Brother", "4x6 dan A4", "Via spooler OS"],
            ["Dye sub", "DNP DS, HiTi P, Selphy", "Auto cut 4x6, 6x8", "Untuk strip cepat"],
          ],
        },
      },
      {
        heading: "Cara memilih yang stabil",
        paragraphs: [
          "Pilih seri yang sama persis dengan perangkat Anda. Untuk kamera: pastikan HTTPS atau localhost (secure context), permission granted, tidak dipakai aplikasi lain, resolusi minimal 480p (warning di bawah itu), ideal 720p plus dan dilaporkan ke device status.",
          "Untuk printer: pastikan driver terinstall, default OS benar, kertas tersedia (browser tidak bisa deteksi kertas habis), lalu print test lolos.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Tidak ada kamera terdeteksi",
        penyebab: "USB lepas, dipakai aplikasi lain, atau bukan secure context",
        solusi: "Colok ulang USB, tutup aplikasi lain, akses via HTTPS atau localhost, reload.",
      },
      {
        gejala: "Kualitas kamera rendah",
        penyebab: "Resolusi di bawah 480p",
        solusi: "Ganti webcam HD 720p plus, cek di device status.",
      },
      {
        gejala: "Print gagal",
        penyebab: "Default OS salah atau kertas habis",
        solusi: "Set default OS, isi kertas, tekan Cetak Ulang.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Kelola Outlet dan Booth",
        slug: "panduan-photobox-owner",
        desc: "Setup wizard dan print test.",
      },
      { title: "Atasi Masalah Umum", slug: "troubleshooting", desc: "Solusi kamera dan print." },
      { title: "Kontak Support", slug: "kontak", desc: "Lapor seri perangkat." },
    ],
  },
  {
    slug: "panduan-printer-kamera",
    title: "Panduan Printer dan Kamera",
    category: "Perangkat",
    summary:
      "Menyiapkan dua jalur cetak hasil foto, jalur struk POS, kamera DSLR lewat bridge, dan membaca hasil deteksi perangkat.",
    audience: "Owner, manager, dan operator booth",
    estimate: "10 menit",
    prerequisites: [
      "Akses dashboard owner dengan izin photobox:write.",
      "Bridge lokal berjalan di komputer booth bila memakai kamera DSLR atau printer CUPS.",
      "PHOTOBOOTH_BRIDGE_TOKEN terpasang di service bridge dan di Setup Perangkat kiosk.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Ada tiga jalur cetak, dan ketiganya diatur terpisah supaya satu printer tidak mengganggu yang lain. Jalur photo mencetak hasil foto ke printer foto (DNP, Canon Selphy, inkjet). Jalur thermal mencetak foto sebagai raster 1-bit ke printer thermal 58 atau 80 mm. Jalur receipt khusus struk POS.",
          "Browser tidak bisa mendaftar printer sendiri. Jadi deteksi dilakukan lewat bridge lokal atau uji cetak fisik: bridge menjawab daftar dan nama printer, sedangkan uji cetak membuktikan kertas benar-benar keluar. Status yang tersimpan berasal dari konfirmasi operator, bukan tebakan.",
        ],
      },
      {
        heading: "Buka setelan hardware",
        paragraphs: [
          "Setelan perangkat berada di dashboard owner, bukan di layar kiosk. Halaman ini menyimpan per grup: kamera, jalur foto, jalur thermal, jalur struk, dan template default. Menyimpan satu grup tidak menimpa grup lain.",
        ],
        steps: [
          "Buka Photoboxes, pilih booth, lalu masuk ke halaman Hardware.",
          "Isi URL bridge lokal bila bukan default. Kosong berarti http://127.0.0.1:17777.",
          "Tekan Deteksi untuk membaca kamera dan printer dari bridge.",
          "Simpan per grup, lalu jalankan uji cetak dan jawab konfirmasi fisik.",
        ],
        note: "Bridge yang tidak menjawab bukan error. Di komputer owner tanpa bridge, isi nama perangkat manual; kiosk tetap mencetak lewat dialog sistem.",
      },
      {
        heading: "Jalur foto",
        paragraphs: [
          "Jalur foto memakai printer foto. Pilih transportnya: dialog sistem (paling sederhana, muncul dialog di tablet), CUPS lewat bridge (tanpa dialog di komputer kiosk), atau thermal bila memang printer thermal yang dipakai untuk foto.",
          "Ukuran kertas, orientasi, penyesuaian gambar, margin, nama media CUPS, dan nama printer diatur di sini. Ukuran yang tersedia: 4x6, 2x6, 5x7, 6x8, dan A6.",
        ],
        steps: [
          "Isi nama printer foto, atau tekan Deteksi lalu pilih dari daftar.",
          "Pilih jalur cetak: Dialog OS, CUPS, atau Thermal Bluetooth.",
          "Pilih ukuran kertas dan orientasi. Auto berarti mengikuti bentuk foto.",
          "Aktifkan Cetak foto aktif, dan Cetak otomatis bila ingin langsung cetak setelah sesi selesai.",
          "Jalankan uji cetak, lalu tandai berhasil hanya bila kertas benar-benar keluar.",
        ],
        table: {
          head: ["Setelan", "Nilai", "Catatan"],
          rows: [
            ["Ukuran kertas", "4x6, 2x6, 5x7, 6x8, A6", "Driver harus menerima media ini"],
            ["Nama media CUPS", "teks bebas", "Kosong = Custom lebar x tinggi"],
            ["Margin", "0 sampai 20 mm", "Area aman diverifikasi lewat uji cetak"],
            ["Dua strip per kertas", "aktif atau nonaktif", "Hanya untuk layout strip 2x6"],
          ],
        },
      },
      {
        heading: "Jalur thermal 58 dan 80 mm",
        paragraphs: [
          "Printer thermal mencetak foto sebagai raster hitam-putih. Lebar kertas hanya 58 mm atau 80 mm, dan lebar itu menentukan berapa titik yang dikirim ke printer: 58 mm sekitar 384 titik, 80 mm sekitar 576 titik.",
          "Transport-nya Web Bluetooth atau Web Serial. Tidak ada pilihan dialog sistem di jalur ini, dan kiosk tidak akan diam-diam memindahkan cetakan ke dialog sistem. Bila browser tidak mendukung Bluetooth, layar cetak menampilkan tombol eksplisit untuk memakai dialog.",
        ],
        steps: [
          "Isi nama printer thermal untuk catatan petugas.",
          "Pilih lebar kertas 58 atau 80 mm. Default 80 mm untuk foto.",
          "Nyalakan printer, aktifkan Bluetooth di perangkat, lalu hubungkan dari layar cetak.",
          "Aktifkan Cetak thermal otomatis bila ingin tanpa klik tambahan.",
        ],
        note: "Nama perangkat Bluetooth tersimpan sebagai informasi untuk petugas, bukan kredensial. Jangan menganggapnya pengaman.",
      },
      {
        heading: "Jalur struk POS",
        paragraphs: [
          "Struk memakai jalur sendiri karena kertasnya gulungan, bukan lembar foto. Pilih transport dialog sistem, CUPS lewat bridge, atau thermal, lalu pilih lebar 58 atau 80 mm. Default struk 58 mm karena itu ukuran printer kasir paling umum.",
          "Jalur dan lebar kertas dicatat pada setiap order POS saat order dibuat. Mengganti printer setelahnya tidak mengubah struk lama, jadi riwayat tetap konsisten.",
        ],
        steps: [
          "Isi nama printer struk.",
          "Pilih jalur cetak struk dan lebar kertas.",
          "Aktifkan Struk aktif dan Struk otomatis bila diinginkan.",
          "Buka satu order di terminal POS, cetak, lalu periksa hasilnya secara fisik.",
        ],
      },
      {
        heading: "Kamera",
        paragraphs: [
          "Kamera punya dua sumber: kamera bawaan perangkat lewat izin browser, atau kamera DSLR yang dikendalikan bridge lokal. Untuk DSLR, bridge memakai gphoto2 dan hanya berjalan di komputer kiosk yang tersambung USB.",
          "Di halaman hardware Anda bisa memilih kamera yang dipakai, mengatur hitungan mundur, resolusi tangkap, cermin pratinjau, dan orientasi layar.",
        ],
        steps: [
          "Pilih sumber kamera: browser atau bridge.",
          "Tekan Deteksi untuk membaca model kamera yang tersambung.",
          "Atur hitungan mundur, resolusi, cermin pratinjau, dan orientasi layar.",
          "Simpan, lalu uji dari layar kamera kiosk.",
        ],
      },
      {
        heading: "Siapa yang boleh mengubah apa",
        paragraphs: [
          "Ada dua penulis setelan yang sama: dashboard owner dan aplikasi booth. Pembagiannya tegas supaya biaya dan produk tidak bisa diubah dari mesin di lokasi.",
        ],
        bullets: [
          "Milik dashboard: jumlah salinan cetak dan layout. Keduanya memengaruhi biaya dan produk yang dijual.",
          "Milik booth: kamera, printer, ukuran kertas, margin, media, jalur cetak, URL bridge, dan timer sesi.",
          "Booth yang mencoba menulis setelan milik dashboard ditolak dengan pesan FIELD_NOT_DEVICE_OWNED, bukan diabaikan diam-diam.",
          "Setelan tampilan booth hanya berlaku di mesin itu dan tidak pernah dikirim ke cloud.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Bridge lokal tidak menjawab",
        penyebab: "Service bridge belum jalan, atau URL bridge salah",
        solusi: "Jalankan bridge di komputer booth, lalu samakan URL di halaman hardware.",
      },
      {
        gejala: "Deteksi printer kosong",
        penyebab: "Token bridge belum diisi atau tidak cocok",
        solusi: "Isi token bridge yang sama di service dan di Setup Perangkat kiosk.",
      },
      {
        gejala: "Uji cetak sukses tapi kertas tidak keluar",
        penyebab: "Spooler menerima job, bukan bukti kertas tercetak",
        solusi:
          "Periksa kertas, daya, dan nama printer. Jangan tandai berhasil sebelum kertas keluar.",
      },
      {
        gejala: "Hasil thermal terpotong",
        penyebab: "Lebar kertas tidak cocok dengan printer",
        solusi: "Samakan pilihan 58 atau 80 mm dengan printer yang terpasang.",
      },
      {
        gejala: "Setelan tersimpan tapi booth tidak berubah",
        penyebab: "Nilai tersimpan di grup, sedangkan kiosk membaca nilai datar",
        solusi:
          "Simpan lewat halaman hardware agar nilai grup ikut disalin ke setelan datar, lalu reload booth.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Kelola Outlet dan Booth",
        slug: "panduan-photobox-owner",
        desc: "Urutan setup booth.",
      },
      {
        title: "Kamera dan Printer Kompatibel",
        slug: "perangkat-kompatibel",
        desc: "Seri yang didukung.",
      },
      {
        title: "Owner: Staff dan POS Kasir",
        slug: "panduan-staff-pos",
        desc: "Cetak struk dari terminal.",
      },
    ],
  },
  {
    slug: "panduan-payment-gateway",
    title: "Owner: Panduan Payment Gateway",
    category: "Pembayaran",
    summary:
      "Menambah credential Tripay atau Midtrans langkah demi langkah, mengatur metode, membaca tes koneksi, dan menyiapkan URL webhook.",
    audience: "Owner",
    estimate: "12 menit",
    prerequisites: [
      "Akun merchant Tripay atau Midtrans milik Anda sendiri.",
      "Akses dashboard owner sebagai owner; manager dan staff tidak bisa mengelola gateway.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Dana pembayaran kiosk masuk langsung ke rekening merchant Anda, bukan ke rekening platform. Karena itu credential disimpan per business dan dikelola sendiri oleh owner.",
          "Selama belum ada credential aktif, kiosk tetap bisa melayani tamu dengan voucher dan tunai. Itu keadaan normal, bukan kerusakan.",
        ],
      },
      {
        heading: "Tambah credential",
        paragraphs: [
          "Satu credential mewakili satu provider pada satu environment. Isian berbeda per provider, dan form hanya menampilkan field yang relevan.",
        ],
        steps: [
          "Buka Settings lalu Payment.",
          "Tekan Tambah Payment Gateway.",
          "Pilih provider: Tripay atau Midtrans.",
          "Pilih environment Sandbox untuk uji coba, Production untuk menerima uang nyata.",
          "Isi label, merchant, dan kunci rahasia sesuai provider.",
          "Pilih minimal satu metode pembayaran.",
          "Aktifkan credential, lalu simpan.",
        ],
        table: {
          head: ["Provider", "Field wajib saat membuat", "Metode yang tersedia"],
          rows: [
            [
              "Midtrans",
              "Merchant ID, Server Key, Client Key",
              "QRIS, GoPay, ShopeePay, VA BCA/BNI/BRI/Permata",
            ],
            ["Tripay", "Merchant Code, API Key, Private Key", "QRIS, VA, Alfamart, Indomaret"],
          ],
        },
        note: "Saat mengedit, kolom rahasia yang dibiarkan kosong berarti nilai lama dipertahankan. Nilainya tidak pernah ditampilkan kembali, jadi simpan salinan aman di tempat Anda sendiri.",
      },
      {
        heading: "Aturan yang perlu diketahui",
        paragraphs: [
          "Beberapa batas ditegakkan server, bukan hanya tampilan, supaya kesalahan tidak baru terasa saat tamu sudah membayar.",
        ],
        bullets: [
          "Maksimal dua credential aktif sekaligus per business. Nonaktifkan satu untuk mengaktifkan yang lain.",
          "Minimal satu metode harus dipilih. Metode yang tidak didukung provider ditolak dengan daftar pilihan yang valid.",
          "Ejaan metode dinormalkan server, jadi qris dan QRIS diperlakukan sama.",
          "Kiosk hanya memakai credential yang environment-nya cocok dengan environment aplikasi.",
          "Kiosk tidak pernah memilih credential dari data yang dikirim browser; server yang menentukan.",
        ],
      },
      {
        heading: "Tes koneksi",
        paragraphs: [
          "Tombol tes memanggil provider memakai credential yang tersimpan. Untuk Midtrans, tes membuat transaksi uji lalu membatalkannya, jadi hanya tersedia untuk sandbox. Tripay hanya membaca status, jadi aman diuji di environment mana pun.",
        ],
        steps: [
          "Simpan credential terlebih dahulu.",
          "Tekan Tes Sandbox atau Tes Production pada kartu credential.",
          "Bila gagal, periksa ulang kunci, environment, dan status project di dashboard provider.",
        ],
      },
      {
        heading: "Siapkan URL webhook",
        paragraphs: [
          "URL webhook tidak disimpan di database; nilainya dihitung dari alamat publik aplikasi. Karena itu ada tiga syarat yang harus benar sebelum URL muncul.",
        ],
        bullets: [
          "Alamat publik aplikasi harus terisi.",
          "Nilainya harus URL yang sah.",
          "Protokolnya wajib HTTPS. Alamat http ditolak.",
        ],
        steps: [
          "Buka kartu credential, lihat bagian Webhook URL.",
          "Bila URL tampil, tekan Salin webhook URL.",
          "Daftarkan URL itu di dashboard provider: Midtrans di Payment Notification URL, Tripay di Callback URL.",
          "Bila tulisan Webhook nonaktif muncul, alasan pastinya tertera di sana. Perbaiki alamat publik lebih dulu.",
        ],
        note: "Untuk Midtrans dan Tripay, kiosk tidak menawarkan metode online selama URL webhook belum aktif.",
      },
      {
        heading: "Uji dari sisi tamu",
        paragraphs: [
          "Credential yang benar belum tentu berarti alur tamu benar. Uji satu transaksi kecil dari kiosk.",
        ],
        steps: [
          "Buka kiosk, pilih paket termurah.",
          "Periksa metode yang muncul sesuai yang Anda aktifkan.",
          "Selesaikan pembayaran, lalu pastikan status berubah menjadi paid tanpa reload.",
          "Periksa transaksi tercatat di dashboard keuangan.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Tes credential gagal",
        penyebab: "Kunci salah, environment tertukar, atau project belum aktif",
        solusi: "Salin ulang kunci, samakan sandbox dan production, periksa dashboard provider.",
      },
      {
        gejala: "Webhook nonaktif",
        penyebab: "Alamat publik kosong, bukan URL sah, atau bukan HTTPS",
        solusi: "Perbaiki alamat publik aplikasi; alasan spesifik tampil di kartu credential.",
      },
      {
        gejala: "Metode online tidak muncul di kiosk",
        penyebab:
          "Tidak ada credential aktif yang cocok environment, atau URL webhook belum aktif untuk provider itu",
        solusi: "Aktifkan credential yang benar dan lengkapi URL webhook.",
      },
      {
        gejala: "Tidak bisa mengaktifkan credential baru",
        penyebab: "Sudah ada dua credential aktif",
        solusi: "Nonaktifkan satu credential lebih dulu.",
      },
      {
        gejala: "Pembayaran masuk tapi status belum paid",
        penyebab: "Webhook belum sampai atau nominal tidak cocok",
        solusi: "Tunggu beberapa detik; jangan ubah harga saat pembayaran masih berjalan.",
      },
    ],
    nextSteps: [
      { title: "Cara Bayar di Kiosk", slug: "panduan-qris", desc: "Uji dari sisi tamu." },
      {
        title: "Owner: Keuangan dan Laporan",
        slug: "panduan-finance-laporan",
        desc: "Baca settlement.",
      },
      {
        title: "Owner: Template dan Frame",
        slug: "panduan-template",
        desc: "Lanjut ke konten booth.",
      },
    ],
  },
  {
    slug: "faq",
    title: "Pertanyaan Umum",
    category: "FAQ",
    summary: "Jawaban singkat untuk pertanyaan yang paling sering masuk dari customer dan owner.",
    audience: "Semua pembaca",
    estimate: "4 menit",
    sections: [
      {
        heading: "Customer",
        paragraphs: [
          "Apakah perlu login untuk foto? Tidak. Customer langsung pilih paket dan bayar tanpa akun.",
          "Di mana hasil foto saya? Scan QR di layar kiosk setelah finalize. Halaman result berisi GIF dan foto berframe yang bisa diunduh tanpa install aplikasi.",
          "Berapa lama foto disimpan? 1 sampai 3 hari sesuai setting booth, default 3 hari. Unduh di hari yang sama.",
          "Bisakah pakai printer sendiri? Bisa. Set sebagai printer default OS kiosk lalu uji lewat print test saat pairing.",
        ],
      },
      {
        heading: "Owner",
        paragraphs: [
          "Apakah harga bisa diubah setelah paket dipakai? Bisa. Transaksi lama tetap memakai harga saat transaksi karena snapshot di order items.",
          "Bagaimana ganti warna brand? Buka Settings Branding lalu ubah primary dan secondary color hex. Perubahan tampil di welcome screen dan background result.",
          "Bagaimana buat voucher? Buka Vouchers lalu buat kode baru dengan tipe, batasan tanggal, limit, minimum transaksi, dan eligibility paket atau outlet.",
          "Bagaimana tambah booth? Buka Photoboxes lalu buat booth baru selama limit plan masih tersedia. Pairing device memakai kode sekali pakai sekitar 5 menit.",
          "Bagaimana batalkan langganan? Hentikan dari dashboard. Akses tetap aktif sampai akhir periode berjalan, tanpa biaya tambahan.",
        ],
      },
      {
        heading: "Pembayaran dan perangkat",
        paragraphs: [
          "Metode apa yang didukung? QRIS via gateway merchant Anda (Tripay atau Midtrans), voucher, dan tunai. Dana masuk langsung ke rekening Anda.",
          "Perangkat apa yang kompatibel? Tablet Android/iOS sebagai PWA dengan kamera internal. Cukup buka link kiosk lalu Add to Home Screen.",
        ],
      },
    ],
    nextSteps: [
      { title: "Mulai Cepat di Booth", slug: "quick-start", desc: "Alur customer lengkap." },
      {
        title: "Owner: Dari Daftar sampai Booth Live",
        slug: "panduan-owner-mulai",
        desc: "Setup owner lengkap.",
      },
      { title: "Kontak Support", slug: "kontak", desc: "Tanya langsung." },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Atasi Masalah Umum",
    category: "Troubleshooting",
    summary: "Solusi cepat untuk kamera, QRIS, hasil unduhan, dan print yang gagal.",
    audience: "Customer dan owner",
    estimate: "6 menit",
    prerequisites: ["Catat slug business, nama booth, dan tangkapan layar sebelum mulai."],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Mulai dari cek paling sederhana: koneksi, permission browser, dan status device. Sebagian besar masalah selesai tanpa reset booth.",
          "Catat slug business, nama booth, dan tangkapan layar sebelum hubungi support agar diagnosis lebih cepat.",
        ],
      },
      {
        heading: "Kamera tidak muncul",
        steps: [
          "Pastikan kiosk diakses via HTTPS atau localhost. Kamera browser diblokir di context tidak aman.",
          "Cek permission kamera di Chrome. Reset lewat tombol Ulangi Setup di detail photobox bila perlu pairing ulang.",
          "Tutup aplikasi lain yang memakai kamera, lalu reload kiosk.",
          "Periksa device status resolusi di dashboard. Di bawah 480p memicu warning tetapi tetap bisa lanjut.",
        ],
      },
      {
        heading: "QRIS tidak tampil",
        steps: [
          "Cek koneksi internet kiosk dan pastikan credential gateway aktif di Settings Payment.",
          "Reload halaman. Status pembayaran dipulihkan otomatis dari server via payment reference.",
          "Jika masih gagal, catat sebagai transaksi manual setelah customer membayar via metode lain.",
          "Pastikan hanya satu QR hidup per booth. Checkout baru menghanguskan checkout open dan payment creating atau pending sebelumnya.",
        ],
      },
      {
        heading: "Foto hasil tidak bisa diunduh",
        steps: [
          "Periksa masa retention. QR result hanya berlaku 1 sampai 3 hari.",
          "Minta owner mengunduh ulang dari dashboard bila sesi masih tersimpan.",
          "Coba browser atau jaringan lain bila file besar gagal diunduh.",
        ],
      },
      {
        heading: "Print gagal",
        steps: [
          "Jalankan Print Test dari setup wizard atau dashboard dan konfirmasi fisik.",
          "Pastikan printer default OS benar dan kertas tersedia. Browser tidak bisa deteksi kertas habis.",
          "Tekan Cetak Ulang bila print error. Untuk paket tanpa print, langsung ke result download atau QR.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Kamera dipakai aplikasi lain",
        penyebab: "NotReadableError: stream terkunci",
        solusi: "Tutup aplikasi lain, reload kiosk.",
      },
      {
        gejala: "QR expired berulang",
        penyebab: "Expiry terlalu pendek atau provider cepat",
        solusi: "Naikkan qris expiry minutes 1 sampai 60, edukasi bayar cepat.",
      },
      {
        gejala: "Link kedaluwarsa",
        penyebab: "Melewati retention",
        solusi: "Unduh di hari yang sama. Minta owner cek retention days.",
      },
      {
        gejala: "Printer tidak terdeteksi",
        penyebab: "Default OS belum di set",
        solusi: "Set default OS, ulangi print test.",
      },
    ],
    nextSteps: [
      { title: "Kontak Support", slug: "kontak", desc: "Lapor dengan detail lengkap." },
      {
        title: "Kamera dan Printer Kompatibel",
        slug: "perangkat-kompatibel",
        desc: "Cek seri perangkat.",
      },
      { title: "Cara Bayar di Kiosk", slug: "panduan-qris", desc: "Ulangi alur bayar." },
    ],
  },
  {
    slug: "kontak",
    title: "Kontak Support",
    category: "Kontak",
    summary: "Hubungi tim SnapyOS bila panduan ini belum menyelesaikan masalah Anda.",
    audience: "Semua pembaca",
    estimate: "2 menit",
    prerequisites: ["Siapkan slug business, nama photobox, dan tangkapan layar."],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Support membantu setup awal, pairing device, konfigurasi QRIS, sampai troubleshooting lapangan langkah demi langkah.",
          "Sertakan detail lengkap agar tiket dan chat lebih cepat ditindaklanjuti.",
        ],
      },
      {
        heading: "Saluran bantuan",
        steps: [
          "Chat WhatsApp ke +62 898 3704 013 untuk respon cepat booth yang sedang live.",
          "Email ke support@snapyos.biz.id dengan slug business, nama photobox, dan tangkapan layar.",
          "Buat tiket dari dashboard Support untuk pantau status terbuka, butuh tindakan, atau selesai.",
          "Buka halaman supported devices sebelum lapor masalah hardware agar seri kamera dan printer jelas.",
        ],
        table: {
          head: ["Saluran", "Alamat", "Cocok untuk"],
          rows: [
            ["WhatsApp", "+62 898 3704 013", "Booth live, respon cepat"],
            ["Email", "support@snapyos.biz.id", "Detail lengkap plus screenshot"],
            ["Tiket dashboard", "/dashboard/support", "Pantau status tiket"],
          ],
        },
      },
    ],
    nextSteps: [
      { title: "Atasi Masalah Umum", slug: "troubleshooting", desc: "Coba solusi mandiri dulu." },
      { title: "Pertanyaan Umum", slug: "faq", desc: "Cek jawaban singkat." },
      { title: "Dokumentasi", slug: "quick-start", desc: "Kembali ke awal." },
    ],
  },
  {
    slug: "panduan-heartbeat-bridge",
    title: "Heartbeat & Bridge",
    category: "Perangkat",
    summary:
      "Urutan deteksi perangkat, pairing device, heartbeat yang muncul di dashboard, dan cetak uji lewat bridge lokal.",
    audience: "Owner dan operator booth",
    estimate: "8 menit",
    prerequisites: [
      "Runtime bridge terpasang di komputer booth.",
      "Perangkat booth tersedia dan tersambung ke jaringan yang sama.",
    ],
    sections: [
      {
        heading: "Ringkasan",
        paragraphs: [
          "Bridge lokal adalah service kecil di komputer booth yang menjembatani kiosk dengan kamera dan printer. Tanpa bridge, kiosk tetap bisa memakai kamera browser dan dialog cetak sistem, tetapi deteksi perangkat dan CUPS tidak tersedia.",
          "Urutan yang benar selalu sama: deteksi perangkat, pairing device, heartbeat muncul di dashboard, lalu cetak uji. Jangan lompat ke cetak uji sebelum heartbeat terlihat, karena status perangkat belum terbaca server.",
        ],
        code: {
          label: "Pola URL bridge dan kiosk",
          lang: "text",
          code: "http://127.0.0.1:17777\n/p/[businessSlug]/[photoboxSlug]",
        },
      },
      {
        heading: "1. Deteksi perangkat",
        paragraphs: [
          "Deteksi membaca daftar kamera dan printer dari bridge. Bila bridge tidak menjawab, halaman hardware menampilkan panel perbaikan berisi langkah dan URL bridge yang dipakai, bukan pesan error mentah.",
          "Nama perangkat hasil deteksi bisa dipilih dari dropdown, atau diketik manual bila bridge mati. Nama manual adalah catatan operator, bukan bukti perangkat terpasang.",
        ],
        steps: [
          "Buka halaman Hardware booth di dashboard owner.",
          "Isi URL bridge bila bukan default. Kosong berarti http://127.0.0.1:17777.",
          "Tekan Deteksi, lalu periksa daftar kamera dan printer yang muncul.",
          "Bila bridge tidak menjawab, jalankan runtime bridge di komputer booth lalu deteksi ulang.",
        ],
      },
      {
        heading: "2. Pairing device",
        paragraphs: [
          "Pairing mengikat satu perangkat kiosk ke satu photobox. Kode aktivasi sekali pakai dan kedaluwarsa sekitar 5 menit, lalu server menerbitkan device token persisten sampai di revoke.",
          "Pairing hanya perlu sekali per perangkat. Bila perangkat diganti atau hilang, revoke dulu dari daftar device agar token lama tidak berlaku.",
        ],
        steps: [
          "Di detail photobox, tekan Tampilkan Kode atau QR.",
          "Di perangkat kiosk buka /p/[businessSlug]/[photoboxSlug].",
          "Masukkan kode atau scan QR, lalu selesaikan setup wizard.",
          "Pastikan kiosk masuk welcome screen dengan branding business Anda.",
        ],
      },
      {
        heading: "3. Heartbeat muncul",
        paragraphs: [
          "Setelah pairing, perangkat mengirim heartbeat berkala. Heartbeat adalah tanda perangkat hidup dan terhubung, bukan bukti kamera atau printer bekerja. Status perangkat di dashboard dibaca dari heartbeat terakhir.",
          "Bila heartbeat tidak muncul, periksa jaringan, jam perangkat, dan status token. Revoke lalu pairing ulang bila token dicurigai tidak valid.",
        ],
        table: {
          head: ["Status heartbeat", "Arti", "Aksi"],
          rows: [
            [
              "Aktif",
              "Perangkat mengirim heartbeat dalam periode terakhir",
              "Tidak perlu tindakan",
            ],
            [
              "Tertunda",
              "Belum ada heartbeat baru, koneksi atau proses kiosk terhenti sementara",
              "Cek jaringan dan pastikan kiosk terbuka, lalu tunggu satu siklus",
            ],
            [
              "Mati",
              "Tidak ada heartbeat sama sekali, perangkat tidak terhubung",
              "Nyalakan perangkat, cek jaringan, lalu pairing ulang bila perlu",
            ],
          ],
        },
      },
      {
        heading: "4. Cetak uji",
        paragraphs: [
          "Cetak uji membuktikan kertas benar-benar keluar. Job yang diterima spooler bukan bukti cetak berhasil, jadi konfirmasi selalu fisik.",
          "Untuk jalur CUPS, bridge harus aktif dan printer tidak offline. Bila status printer offline atau disabled, kiosk menolak mengirim job dan menampilkan langkah perbaikan.",
        ],
        steps: [
          "Pastikan heartbeat sudah aktif di dashboard.",
          "Buka panel uji cetak di halaman hardware atau setup wizard.",
          "Kirim uji cetak, lalu periksa kertas keluar.",
          "Tandai berhasil hanya bila kertas benar-benar tercetak.",
        ],
      },
    ],
    troubleshooting: [
      {
        gejala: "Bridge tidak menjawab",
        penyebab: "Runtime bridge belum jalan atau URL bridge salah",
        solusi:
          "Jalankan bridge di komputer booth, samakan URL di halaman hardware, lalu tekan Deteksi ulang.",
      },
      {
        gejala: "Heartbeat tidak muncul",
        penyebab: "Perangkat belum pairing, token di revoke, atau jaringan terputus",
        solusi: "Cek jaringan, revoke lalu pairing ulang, dan pastikan kiosk terbuka.",
      },
      {
        gejala: "CUPS tidak aktif",
        penyebab: "Service CUPS atau spooler berhenti, atau printer offline",
        solusi:
          "Aktifkan CUPS/spooler di komputer booth, periksa kabel dan kertas, lalu ulangi cetak uji.",
      },
    ],
    nextSteps: [
      {
        title: "Owner: Kelola Outlet dan Booth",
        slug: "panduan-photobox-owner",
        desc: "Pairing dan status device.",
      },
      {
        title: "Kamera dan Printer Kompatibel",
        slug: "perangkat-kompatibel",
        desc: "Seri perangkat yang didukung.",
      },
      { title: "Atasi Masalah Umum", slug: "troubleshooting", desc: "Solusi per gejala." },
    ],
  },
];

export function listHelpArticles(category?: string | null): HelpArticle[] {
  const q = (category ?? "").trim().toLowerCase();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((a) => a.category.toLowerCase() === q);
}

export function sectionParagraphs(s: HelpSection): string[] {
  if (s.paragraphs && s.paragraphs.length > 0) return s.paragraphs;
  return (s.items ?? []).filter((t) => !/^Langkah \d+\s*:/.test(t.trim()));
}

export function sectionSteps(s: HelpSection): string[] {
  if (s.steps && s.steps.length > 0) return s.steps;
  return (s.items ?? []).filter((t) => /^Langkah \d+\s*:/.test(t.trim()));
}

export function sectionBullets(s: HelpSection): string[] {
  return s.bullets ?? [];
}

export function articleKeywords(a: HelpArticle): string {
  const parts = [
    a.title,
    a.summary,
    a.category,
    a.audience ?? "",
    ...(a.prerequisites ?? []),
    ...a.sections.flatMap((s) => [
      s.heading,
      ...sectionParagraphs(s),
      ...sectionSteps(s),
      ...sectionBullets(s),
      ...(s.table ? [...s.table.head, ...s.table.rows.flat()] : []),
      s.code?.code ?? "",
      s.note ?? "",
    ]),
    ...(a.troubleshooting ?? []).flatMap((t) => [t.gejala, t.penyebab, t.solusi]),
    ...(a.nextSteps ?? []).flatMap((n) => [n.title, n.desc ?? ""]),
  ];
  return parts.join(" ");
}

export function searchHelpArticles(term?: string | null): HelpArticle[] {
  const q = (term ?? "").trim().toLowerCase();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((a) => articleKeywords(a).toLowerCase().includes(q));
}

export type DocGroup = { slug: string; title: string; desc: string; slugs: string[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    slug: "mulai",
    title: "Mulai",
    desc: "Mulai dari nol sampai sesi pertama jalan.",
    slugs: ["quick-start", "panduan-owner-mulai"],
  },
  {
    slug: "customer",
    title: "Customer",
    desc: "Alur pengunjung booth dari layar sampai file tersimpan.",
    slugs: ["panduan-photobox", "hasil-foto"],
  },
  {
    slug: "owner",
    title: "Owner",
    desc: "Setup booth dan operasional harian sampai laporan.",
    slugs: [
      "panduan-photobox-owner",
      "panduan-template",
      "panduan-voucher",
      "panduan-dashboard",
      "panduan-staff-pos",
      "panduan-finance-laporan",
    ],
  },
  {
    slug: "pembayaran",
    title: "Pembayaran",
    desc: "QRIS, voucher, dan tunai di kiosk plus setup merchant.",
    slugs: ["panduan-qris", "panduan-payment-setup", "panduan-payment-gateway"],
  },
  {
    slug: "perangkat",
    title: "Perangkat",
    desc: "Kamera dan printer yang didukung, dua jalur cetak, dan cara deteksi perangkat.",
    slugs: ["perangkat-kompatibel", "panduan-printer-kamera", "panduan-heartbeat-bridge"],
  },
  {
    slug: "bantuan",
    title: "Bantuan",
    desc: "Jawaban cepat, solusi per gejala, dan kontak support.",
    slugs: ["faq", "troubleshooting", "kontak"],
  },
];

export function getGroupBySlug(slug: string): DocGroup | undefined {
  return DOC_GROUPS.find((g) => g.slug === slug);
}

export function getGroupForArticleSlug(slug: string): DocGroup | undefined {
  return DOC_GROUPS.find((g) => g.slugs.includes(slug));
}

export function articleHref(slug: string): string {
  const g = getGroupForArticleSlug(slug);
  return g ? `/docs/${g.slug}#${slug}` : `/docs#${slug}`;
}

export function getPrevNextGroup(slug: string): { prev: DocGroup | null; next: DocGroup | null } {
  const idx = DOC_GROUPS.findIndex((g) => g.slug === slug);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? (DOC_GROUPS[idx - 1] ?? null) : null,
    next: idx < DOC_GROUPS.length - 1 ? (DOC_GROUPS[idx + 1] ?? null) : null,
  };
}

export function getDocBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
