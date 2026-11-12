import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import catalog from "@/data/gphoto2-cameras.json";

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 48;
const TYPES = ["dslr", "mirrorless", "compact", "action", "other"] as const;
const TYPE_LABEL: Record<string, string> = {
  dslr: "DSLR",
  mirrorless: "Mirrorless",
  compact: "Compact",
  action: "Action",
  other: "Lainnya",
};
const SUPPORT_LABEL: Record<string, string> = {
  full: "Siap booth",
  capture: "Capture saja",
  transfer: "Transfer file",
  unknown: "Belum terverifikasi",
};
const SUPPORT_CLASS: Record<string, string> = {
  full: "bg-accent-3 text-ink",
  capture: "bg-accent-2 text-ink",
  transfer: "bg-surface text-ink",
  unknown: "bg-bg text-muted-foreground",
};

export const metadata: Metadata = {
  title: "Kamera yang Didukung | SnapyOS",
  description:
    "Daftar kamera yang didukung libgphoto2/gphoto2 untuk booth photobox SnapyOS, dengan label kemampuan capture, liveview, dan transfer file.",
  alternates: { canonical: "/kamera" },
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function buildHref(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `/kamera?${query}` : "/kamera";
}

export default async function CameraCatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = first(params.q).toLowerCase();
  const brand = first(params.brand);
  const type = first(params.type);
  const support = first(params.support);
  const page = Math.max(1, Number(first(params.page)) || 1);

  const brands = [...new Set(catalog.cameras.map((camera) => camera.brand))].sort((a, b) =>
    a.localeCompare(b, "en")
  );

  const filtered = catalog.cameras.filter((camera) => {
    if (q && !`${camera.model} ${camera.brand}`.toLowerCase().includes(q)) return false;
    if (brand && camera.brand !== brand) return false;
    if (type && camera.camera_type !== type) return false;
    if (support === "all") return true;
    if (support) return camera.booth_support === support;
    return camera.booth_support === "full" || camera.booth_support === "capture";
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  const baseParams = { q: first(params.q), brand, type, support };

  return (
    <div className="relative min-h-[100dvh] bg-bg text-ink">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 md:px-8 md:pt-14">
        <header className="flex flex-col gap-4 border-b-2 border-ink pb-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            {`KATALOG PERANGKAT · LIBGPHOTO2 ${catalog.source.gphoto2_version}`}
          </p>
          <h1 className="font-display text-4xl font-black uppercase leading-[0.92] tracking-[-0.03em] md:text-6xl">
            Kamera yang didukung
          </h1>
          <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground md:text-base">
            {`${catalog.count.toLocaleString("id-ID")} model dari daftar resmi libgphoto2/gphoto2. Label kemampuan menunjukkan apa yang bisa dilakukan booth, bukan klaim dukungan resmi SnapyOS.`}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {`SNAPSHOT ${new Date(catalog.generated_at).toLocaleDateString("id-ID")} · SUMBER ${catalog.source.kind.toUpperCase()}`}
          </p>
        </header>

        <form method="get" className="mt-6 grid gap-3 border-2 border-ink bg-surface p-4 md:grid-cols-5 md:p-5">
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              Cari model / brand
            </span>
            <input
              type="search"
              name="q"
              defaultValue={first(params.q)}
              placeholder="mis. Canon EOS R5"
              className="min-h-11 border-2 border-ink bg-bg px-3 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">Brand</span>
            <select
              name="brand"
              defaultValue={brand}
              className="min-h-11 border-2 border-ink bg-bg px-2 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <option value="">Semua</option>
              {brands.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">Tipe</span>
            <select
              name="type"
              defaultValue={type}
              className="min-h-11 border-2 border-ink bg-bg px-2 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <option value="">Semua</option>
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {TYPE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              Kemampuan
            </span>
            <select
              name="support"
              defaultValue={support}
              className="min-h-11 border-2 border-ink bg-bg px-2 font-mono text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <option value="">Siap booth + capture</option>
              <option value="full">Siap booth</option>
              <option value="capture">Capture saja</option>
              <option value="transfer">Transfer file</option>
              <option value="unknown">Belum terverifikasi</option>
              <option value="all">Semua</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 md:col-span-5">
            <button
              type="submit"
              className="min-h-11 border-2 border-ink bg-ink px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-bg"
            >
              Terapkan filter
            </button>
            <Link
              href="/kamera"
              className="flex min-h-11 items-center border-2 border-ink px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
            >
              Reset
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {`Menampilkan ${total === 0 ? 0 : start + 1}–${Math.min(start + PAGE_SIZE, total)} dari ${total.toLocaleString("id-ID")}`}
            </span>
          </div>
        </form>

        {rows.length === 0 ? (
          <div className="mt-6 border-2 border-dashed border-ink/40 p-6">
            <p className="font-display text-xl uppercase">Tidak ada model yang cocok</p>
            <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
              Coba hapus filter brand/tipe, atau pilih kemampuan “Semua”. Kamera PTP generik bisa
              tetap bekerja meski tidak tercantum.
            </p>
            <Link href="/kamera" className="mt-4 inline-flex min-h-11 items-center border-2 border-ink px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              Hapus semua filter
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 hidden border-2 border-ink md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-ink bg-surface">
                    {["Model", "Brand", "Tipe", "Kemampuan", "Driver", "Catatan"].map((label) => (
                      <th
                        key={label}
                        className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((camera) => (
                    <tr key={camera.id} className="border-b border-ink/20 last:border-b-0">
                      <td className="px-3 py-2 font-mono text-xs">{camera.model}</td>
                      <td className="px-3 py-2 font-mono text-xs">{camera.brand}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {TYPE_LABEL[camera.camera_type] ?? camera.camera_type}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex border border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${SUPPORT_CLASS[camera.booth_support] ?? ""}`}
                        >
                          {SUPPORT_LABEL[camera.booth_support] ?? camera.booth_support}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em]">
                        {camera.driver_status}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {camera.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-6 flex flex-col gap-3 md:hidden">
              {rows.map((camera) => (
                <li key={camera.id} className="border-2 border-ink bg-surface p-4">
                  <p className="font-mono text-sm font-bold">{camera.model}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {`${camera.brand} · ${TYPE_LABEL[camera.camera_type] ?? camera.camera_type} · ${camera.driver_status}`}
                  </p>
                  <span
                    className={`mt-3 inline-flex border border-ink px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${SUPPORT_CLASS[camera.booth_support] ?? ""}`}
                  >
                    {SUPPORT_LABEL[camera.booth_support] ?? camera.booth_support}
                  </span>
                  {camera.notes && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {camera.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <nav className="mt-6 flex flex-wrap items-center gap-2" aria-label="Pagination">
                {currentPage > 1 && (
                  <Link
                    href={buildHref({ ...baseParams, page: currentPage - 1 })}
                    className="flex min-h-11 items-center border-2 border-ink px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                  >
                    Sebelumnya
                  </Link>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                  {`Halaman ${currentPage} / ${totalPages}`}
                </span>
                {currentPage < totalPages && (
                  <Link
                    href={buildHref({ ...baseParams, page: currentPage + 1 })}
                    className="flex min-h-11 items-center border-2 border-ink px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                  >
                    Berikutnya
                  </Link>
                )}
              </nav>
            )}
          </>
        )}

        <footer className="mt-10 border-t-2 border-ink pt-4">
          <p className="max-w-[80ch] text-xs leading-relaxed text-muted-foreground">
            {`Daftar berdasarkan libgphoto2/gphoto2 versi ${catalog.source.gphoto2_version}, tanggal ${new Date(catalog.generated_at).toLocaleDateString("id-ID")}; lisensi LGPL; kamera PTP generik dapat bekerja meski tidak tercantum.`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Butuh bantuan menyiapkan kamera?{" "}
            <Link href="/docs" className="underline underline-offset-4">
              Baca dokumentasi
            </Link>
            .
          </p>
        </footer>
      </main>
      <SiteFooter />
    </div>
  );
}
