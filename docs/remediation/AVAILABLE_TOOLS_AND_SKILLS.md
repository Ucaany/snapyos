# AVAILABLE TOOLS AND SKILLS

Inventaris environment Kilo Code untuk sesi remediasi ini. Hanya kemampuan yang
benar-benar tersedia yang dicatat.

## Skills (`.agents/skills/`)

| Skill | Relevansi |
|---|---|
| `industrial-brutalist-ui` | Bahasa visual tunggal SnapyOS (wajib untuk UI) |
| `design-taste-frontend` | Anti-slop frontend |
| `full-output-enforcement` | Larangan placeholder/truncation |
| `high-end-visual-design` | Hanya standar interaksi, bukan estetika |
| `accessibility` | Audit WCAG 2.2 |
| `antislop`, `antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code` | Filter kualitas UI/copy/mobile/komentar |
| `security-audit`, `find-security-vulnerabilities-in-code`, `owasp-top-10-testing`, `web-app-penetration-testing`, `api-security-testing`, `application-security-testing` | Audit keamanan (Strix-based) |
| `codebase-memory` | Query graph kode (MCP) |
| `find-docs` | Dokumentasi library terkini |

## MCP

| Server | Tool yang tersedia | Catatan |
|---|---|---|
| `codebase-memory-mcp` | `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `check_index_coverage`, `index_status`, `detect_changes` | Graph-first discovery; fallback grep/read untuk literal |
| `desktop_*` (Kilo desktop) | `desktop_browser_open`, `desktop_files_open`, `desktop_git_changes_open`, `desktop_kilo_ui_html_render`, `desktop_terminal_*` | Bukan browser automation penuh; tidak ada Playwright MCP |

## Browser automation

- **Tidak ada** Playwright MCP / Chrome DevTools MCP pada sesi ini.
- `desktop_browser_open` hanya menampilkan URL ke user, tidak mengembalikan
  konten atau menggerakkan browser.
- Konsekuensi: E2E browser otomatis **tidak dijalankan**. Verifikasi UI
  dilakukan lewat build, typecheck, lint, dan inspeksi kode. Status E2E:
  `NOT VERIFIED`.

## Testing

- `npm test` — `node --test` untuk runtime print/camera, layout, branding,
  sync-gphoto2 (tanpa framework tambahan).
- `npm run lint` — ESLint 9.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` — Next 16 standalone.
- Tidak ada Vitest/Jest/Playwright terpasang. Menambah dependency baru tidak
  dilakukan tanpa persetujuan.

## Hardware

- Kamera fisik, printer CUPS, dan bridge lokal **tidak tersedia** di environment
  ini. Validasi hardware: `NOT VERIFIED` + prosedur manual di
  `HARDWARE_VALIDATION.md`.

## Batasan lain

- Tidak ada akses ke database produksi atau kredensial produksi.
- Tidak ada migrasi destruktif yang dijalankan.
- `.env` tidak dibaca/dicetak.
