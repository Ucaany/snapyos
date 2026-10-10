import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera, ImageIcon, Package, Store } from "lucide-react";

import { destinationFor } from "@/lib/destination";
import { can } from "@/lib/rbac";
import { getActiveBusiness, getUserMemberships, requireUser } from "@/lib/tenant";
import { getStaffOverview, type BoothStatus } from "@/server/staff-overview";

export const metadata: Metadata = {
  title: "Staff: SnapyOS",
};

const STATUS_LABEL: Record<BoothStatus, string> = {
  online: "ONLINE",
  offline: "OFFLINE",
  maintenance: "MAINT",
};

const dateFmtTime = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

function elapsedMinutes(startISO: string, nowMs: number): number {
  const startedMs = new Date(startISO).getTime();
  if (Number.isNaN(startedMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedMs) / 60_000));
}

// Komponen di-deklarasi inline karena ringkas & satu kali pakai (no over-abstraction).
export default async function StaffDashboardPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const memberships = await getUserMemberships(user.id);
  const dest = destinationFor(memberships);
  if (dest !== "/staff") redirect(dest);

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/welcome");

  // Pakai `active.role` langsung, getActiveBusiness sudah return membership
  // (business + role) yang tervalidasi via getUserMemberships. Panggilan
  // getMembership() kedua di sini redundan (STEP 7); React.cache di tenant.ts
  // membuatnya cheap kalau ada, tapi kode jadi lebih bersih & konsisten
  // dengan seluruh page dashboard yang cuma pakai active.role untuk can().
  if (can(active.role, "transaction:read")) redirect("/dashboard");

  const overview = await getStaffOverview(user.id, active.business.id);
  const nowMs = overview.nowMs;
  const noBooth = overview.boothCounts.total === 0;

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {"/// STATION.CTL · "}
            <span className="text-accent">{STATUS_LABEL[overview.boothCounts.online > 0 ? "online" : "offline"]}</span>
          </p>
          <h1 className="mt-2 font-display text-4xl uppercase tracking-tight md:text-5xl">
            {overview.businessName}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            ROLE <span className="text-ink">{overview.role.toUpperCase()}</span>
            {" · "}
            TZ {overview.timeZone} · /p/{overview.businessSlug}
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="size-2 bg-accent shadow-[0_0_0_2px_#111111]" aria-hidden />
          <span className="text-ink">LIVE</span>
          <span aria-hidden>·</span>
          <time dateTime={new Date(nowMs).toISOString()}>
            {dateFmtTime.format(new Date(nowMs))} WIB
          </time>
        </div>
      </header>

      {/* Bar 1, Telemetri Booth (3 sel grid tipis ala brutalist blueprint) */}
      <section aria-labelledby="booth-telemetry">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <h2 id="booth-telemetry">{"// BOOTH.TELEMETRY"}</h2>
          <span aria-hidden className="h-px flex-1 bg-ink/30" />
          <span>{overview.boothCounts.total} UNIT</span>
        </div>
        {noBooth ? (
          <EmptyBooth
            href="/staff/photoboxes"
            label="Belum ada booth. Hubungi owner."
          />
        ) : (
          <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink shadow-[4px_4px_0_0_#111111] sm:grid-cols-3">
            <TelemCell
              label="ONLINE"
              value={overview.boothCounts.online}
              tone="accent-3"
              sub="siap jalan"
            />
            <TelemCell
              label="OFFLINE"
              value={overview.boothCounts.offline}
              tone="muted"
              sub="perlu dicek"
            />
            <TelemCell
              label="MAINT"
              value={overview.boothCounts.maintenance}
              tone="destructive"
              sub="sedang diservis"
            />
            <TelemCell
              label="TOTAL"
              value={overview.boothCounts.total}
              tone="ink"
              sub="semua booth"
            />
            <TelemCell
              label="OUTLET"
              value={overview.outletCount}
              tone="ink"
              sub="lokasi aktif"
            />
            <TelemCell
              label="HARI INI"
              value={overview.todayCount}
              tone="ink"
              sub="sesi dimulai"
            />
          </dl>
        )}
      </section>

      {/* Bar 2, Aktif sekarang + Resource chips */}
      <section aria-labelledby="active-sessions" className="flex flex-col gap-4">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <h2 id="active-sessions">{"// ACTIVE.SESSIONS"}</h2>
          <span aria-hidden className="h-px flex-1 bg-ink/30" />
          <span>{overview.activeSessions.length} LIVE</span>
        </div>
        {overview.activeSessions.length === 0 ? (
          <div className="border-2 border-dashed border-ink/40 bg-muted p-6 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {"/// NO ACTIVE SESSIONS · MENUNGGU CUSTOMER"}
          </div>
        ) : (
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {overview.activeSessions.map((s) => {
              const minutes = elapsedMinutes(s.started_at, nowMs);
              const pct = Math.min(100, Math.round((minutes / 5) * 20));
              return (
                <li
                  key={s.id}
                  className="border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_0_#111111]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {s.outlet_name ?? "Tanpa outlet"} ·{" "}
                        <span className="text-ink">BOOTH</span>
                      </p>
                      <p className="mt-0.5 font-display text-lg font-bold uppercase leading-tight">
                        {s.photobox_name}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {s.package_name ?? "Tanpa package"}
                      </p>
                    </div>
                    <span className="border-2 border-accent-3 bg-accent-3/30 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
                      ● LIVE
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    <span>MULAI {dateFmtTime.format(new Date(s.started_at))} WIB</span>
                    <span className="text-ink">{minutes} MIN</span>
                  </div>
                  <div className="mt-2 h-2 border-2 border-ink bg-surface">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Bar 3, Resource cepat */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ResourceCard
          icon={Camera}
          label="Booth"
          count={overview.boothCounts.total}
          href="/staff/photoboxes"
          sub={overview.activeSessions.length + " sesi aktif"}
        />
        <ResourceCard
          icon={Store}
          label="Outlet"
          count={overview.outletCount}
          href="/staff/outlets"
          sub="Lokasi photobox"
        />
        <ResourceCard
          icon={Package}
          label="Package"
          count={overview.packageCount}
          href="/staff/packages"
          sub="Daftar harga"
        />
        <ResourceCard
          icon={ImageIcon}
          label="Template"
          count={overview.templateCount}
          href="/staff/templates"
          sub="Frame aktif"
        />
      </section>

      {/* Footer block, operasional reminder */}
      <section className="border-2 border-ink bg-ink p-5 text-bg shadow-[4px_4px_0_0_#ffd400]">
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-bg/70">
          <span>{"// BRIEFING.STANDUP"}</span>
          <span className="text-accent">SHIFT ON</span>
        </div>
        <p className="mt-2 font-display text-lg uppercase leading-tight tracking-tight">
          Customer bayar dulu via QRIS, lalu sesi dimulai. Pantau{" "}
          <span className="text-accent">BOOTH.ONLINE</span> yang mati siang
          ini suruh owner restart.
        </p>
        <p className="mt-2 max-w-[70ch] font-mono text-[11px] uppercase tracking-[0.06em] text-bg/70">
          Tidak ada akses finansial dari shell ini. Untuk transaksi &
          settlement → owner.
        </p>
      </section>
    </div>
  );
}

/* --- Sub-components (private to file; no over-abstraction) --- */

function TelemCell({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number;
  tone: "accent-3" | "destructive" | "muted" | "ink";
  sub: string;
}) {
  const toneCls =
    tone === "accent-3"
      ? "text-accent-3"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-ink";
  return (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <dt className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>{label}</span>
        <span
          aria-hidden
          className={`size-2 ${tone === "accent-3" ? "bg-accent-3" : tone === "destructive" ? "bg-destructive" : tone === "muted" ? "bg-muted-foreground" : "bg-ink"}`}
        />
      </dt>
      <dd className={`font-mono text-2xl font-bold leading-none md:text-3xl ${toneCls}`}>
        {String(value).padStart(2, "0")}
      </dd>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {sub}
      </p>
    </div>
  );
}

function ResourceCard({
  icon: Icon,
  label,
  count,
  href,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  href: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_0_#111111] transition-all hover:bg-accent active:translate-y-[1px] active:shadow-none"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink bg-bg group-hover:bg-surface">
        <Icon className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-2xl font-bold leading-none md:text-3xl">
          {String(count).padStart(2, "0")}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {sub}
        </span>
      </span>
    </Link>
  );
}

function EmptyBooth({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-2 border-dashed border-ink/40 bg-muted p-6">
      <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
        {"/// "}
        {label}
      </p>
      <Link
        href={href}
        className="border-2 border-ink bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink shadow-[2px_2px_0_0_#111111] hover:bg-accent active:translate-y-[1px] active:shadow-none"
      >
        Buka halaman booth →
      </Link>
    </div>
  );
}
