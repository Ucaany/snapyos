# 13. Skill & Anti-Slop Requirements

Dokumen ini menetapkan **skill yang wajib diaktifkan/load** sebelum development dimulai, serta aturan anti-slop yang mengikat seluruh implementasi SnapyOS. Aturan di sini **melengkapi** (bukan mengganti) design system Neo-Brutalism di `11-design-system.md` dan seluruh PRD.

---

## 13.1 Skill yang Diaktifkan (Load Sebelum Mulai)

| Nama yang disebut user | Skill terpasang di sistem | Peran |
|------------------------|---------------------------|-------|
| `tasteskill` | `design-taste-frontend` | Anti-slop frontend: brief inference, anti-default discipline, typography, layout diversification, AI-tells ban, copy audit |
| `skillsh` | `industrial-brutalist-ui` | Bahasa visual brutalist/industrial (Swiss Industrial Print + Tactical Telemetry) — basis Neo-Brutalism SnapyOS |
| `documentasi` | `full-output-enforcement` | Output lengkap: larangan `// ...`, `// TODO`, skeleton, placeholder; `[PAUSED]` breakpoint saat token limit |
| (tambahan) | `high-end-visual-design` | Standar interaksi premium (haptic feedback, motion, state) — **hanya bagian yang tidak konflik** (lihat 13.2) |

**Cara aktivasi:** gunakan tool `skill` dengan nama di atas sebelum menulis kode frontend. Aturan-aturan ini menjadi constraint aktif pada sesi development.

---

## 13.2 Resolusi Konflik (Prioritas Tertinggi → Terendah)

1. **PRD SnapyOS (Neo-Brutalism)** — sumber kebenaran utama.
2. **`industrial-brutalist-ui`** — visual language (selaras dengan Neo-Brutalism).
3. **`design-taste-frontend`** — disiplin anti-slop & kualitas layout.
4. **`high-end-visual-design`** — hanya bagian non-konflik.
5. **`full-output-enforcement`** — berlaku mutlak untuk seluruh output kode.

### Konflik spesifik yang di-override

| Aturan skill lain | Aturan SnapyOS (MENANG) |
|-------------------|----------------------|
| `high-end-visual-design` melarang hard shadow `rgba(0,0,0,0.3)` & "generic 1px gray border" | SnapyOS **wajib** hard offset shadow (`4px 4px 0`) & thick border 2–4px — ini inti Neo-Brutalism |
| `high-end-visual-design` ban font Inter/Roboto | SnapyOS boleh Inter/space mono, tapi **utama** pakai display bold (Archivo Black / Space Grotesk) + mono (Space Mono / JetBrains Mono) |
| `high-end-visual-design` ban border-radius, pakai rounded-full | SnapyOS pakai radius 0–4px (bukan pill untuk kartu/button utama) |
| `design-taste-frontend` discourages `lucide-react` | SnapyOS **wajib** Lucide (sesuai PRD §58 & §51) — override karena stack sudah ditetapkan |
| `design-taste-frontend` ban marquee >1, eyebrow >1/3 section | Landing SnapyOS boleh marquee/eyebrow secukupnya, tetap terkontrol |

---

## 13.3 Aturan Anti-Slop WAJIB (dari design-taste-frontend)

### 13.3.1 Design Read (wajib sebelum kode)
Nyatakan satu baris sebelum menulis UI. Untuk SnapyOS:
> *"Reading this as: SaaS landing + business dashboard + kiosk photobox app for UMKM photobox owners, with a Neo-Brutalist language (thick borders, hard offset shadows, flat surfaces, bold type), leaning toward Tailwind + shadcn/ui (customized) + Space Grotesk/Archivo Black display + mono metadata."*

### 13.3.2 Anti-Default Discipline
Dilarang: AI-purple gradient, centered hero di atas dark mesh, 3 equal feature cards, glassmorphism berlebihan, infinite micro-animation di semua tempat, Inter + slate-900 sebagai satu-satunya tone.

### 13.3.3 Typography
- Display/headline: bold sans, `tracking-tighter leading-none` (hati-hati italic descender → `leading-[1.1]` + `pb-1`).
- Body: `text-base` kontras tinggi.
- Mono untuk angka/metadata (metric cards, transaksi).
- Jangan inject serif acak ke headline sans.

### 13.3.4 Color
- Neo-Brutalism accent: kuning `#FFD400`, pink `#FF5C8A`, hijau `#38D9A9`, biru `#4D6BFF` — **satu accent dominan per halaman**, sisanya terkontrol.
- **Color consistency lock:** accent dipilih → dipakai konsisten sehalaman, tidak berubah di section lain.

### 13.3.5 Layout Discipline (hard rules)
- Hero muat di viewport awal: headline max 2 baris, subtext max 20 kata, CTA terlihat tanpa scroll.
- Nav satu baris di desktop, tinggi ≤ 80px.
- **Bento grid**: jumlah cell = jumlah konten (tidak ada cell kosong); minimal 2–3 cell punya variasi visual nyata (gambar/warna/pattern).
- **Zigzag alternation cap:** max 2 section image+text split berurutan.
- **Eyebrow restraint:** max 1 eyebrow per 3 section.
- **Section repetition ban:** layout family yang sama max 1x per halaman.
- **Split-header ban:** hindari "headline kiri + paragraf kanan" sebagai default.

### 13.3.6 UI States (wajib lengkap)
- Loading → skeletal matching layout (bukan spinner generik).
- Empty → composed + cara mengisi.
- Error → inline/contextual.
- Tactile: `:active` → `-translate-y-[1px]` / `scale-[0.98]`.
- **Button contrast** WCAG AA; CTA tidak wrap (label ≤ 3 kata).
- **No duplicate CTA intent:** satu label per intent di seluruh halaman.
- Form: label di atas input, error di bawah, placeholder bukan pengganti label.

### 13.3.7 Copy Audit (wajib sebelum ship)
Baca ulang semua string: hapus copy yang grammatically broken, referent tak jelas, atau terdengar "AI thoughtfulness". Boring copy > cute AI copy. Angka presisi palsu (`92%`, `4.1×`) hanya boleh dari data nyata atau ditandai mock.

---

## 13.4 Aturan Visual Brutalist WAJIB (dari industrial-brutalist-ui)

Pilih **satu** archetype dan komit. Untuk SnapyOS default: **Swiss Industrial Print (Light)** + aksen sesekali Tactical Telemetry untuk data.

| Aspek | Spesifikasi |
|-------|-------------|
| Substrate | Off-white paper `#FFFDF5` / `#F4F4F0` (bukan pure white) |
| Ink | `#111111` (bukan `#000`) |
| Accent | `#FF2A2A` merah hazard ATAU kuning `#FFD400` (satu accent dominan) |
| Macro type | Neo-grotesque heavy: Archivo Black / Space Grotesk, `clamp(4rem, 10vw, 15rem)`, tracking `-0.03em` s/d `-0.06em`, leading `0.85–0.95`, uppercase |
| Micro type | Mono: Space Mono / JetBrains Mono / IBM Plex Mono, 10–14px, tracking `0.05–0.1em`, uppercase — untuk ID transaksi, metadata, angka |
| Grid | CSS Grid deterministik, `gap:1px` + background kontras untuk garis tipis |
| Border | Solid 1–2px, radius 0 (atau 4px maks) |
| Syntax decoration | `[ ... ]`, `>>>`, `///` untuk framing section/data |
| Markers | `®`, `™`, `+` crosshair, barcode stripes, `REV x.x` sebagai dekorasi struktural |
| Texture | Noise/grain global (fixed, `pointer-events-none`), scanline hanya untuk elemen terminal (opsional) |

**Larangan brutalist:** gradient, soft drop shadow, translucency (glassmorphism) — ganti dengan flat + hard offset shadow (definisi Neo-Brutalism SnapyOS).

---

## 13.5 Aturan Full Output (wajib mutlak)

- Dilarang: `// ...`, `// TODO`, `// implement here`, `/* ... */`, bare `...`, "for brevity", "the rest follows the same pattern", skeleton saat diminta full implementation.
- Jika mendekati token limit: tulis penuh sampai breakpoint bersih, lalu `[PAUSED — X of Y complete. Send "continue" ...]`, lanjut persis di titik berhenti.
- Setiap deliverable dihitung & di-cross-check sebelum merespons.

---

## 13.6 Pre-Flight Checklist (sebelum declare done)

- [ ] Neo-Brutalism diterapkan (border tebal + hard shadow + flat + radius 0–4px)
- [ ] Tidak ada generic AI slop (purple gradient, 3 equal cards, glassmorphism berlebihan)
- [ ] Accent color konsisten sehalaman
- [ ] Hero muat viewport, nav satu baris, CTA tidak wrap
- [ ] Loading/empty/error state lengkap
- [ ] Kontras WCAG AA (button, form, teks)
- [ ] Copy di-audit (tanpa AI-cute/template-y strings)
- [ ] Output lengkap (tanpa placeholder/`...`)
- [ ] Mobile collapse eksplisit per section
- [ ] Owner payment: secret credential redacted, `total_amount` provider terlihat, QR polling berhenti pada final/unmount
- [ ] Owner add-on: hanya entitlement dikelola owner; katalog global tetap admin-only
- [ ] Dependency audit hijau: `npm audit` tanpa advisory **critical** (transitive dev-time boleh tercatat sebagai residual, bukan blocking)
