import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CircleAlert,
  Clock3,
  ImageIcon,
  Package,
  Radio,
  Store,
} from "lucide-react";

import { LiveSessionMeta, StationClock } from "@/components/staff/StaffLiveClock";
import {
  StaffEmptyState,
  StaffMeta,
  StaffPageHeader,
  StaffPanel,
  StaffPanelHeader,
} from "@/components/staff/StaffPrimitives";
import { destinationFor } from "@/lib/destination";
import { can } from "@/lib/rbac";
import { clockParts } from "@/lib/staff-live";
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

export default async function StaffDashboardPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const memberships = await getUserMemberships(user.id);
  const dest = destinationFor(memberships);
  if (dest !== "/staff") redirect(dest);

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/welcome");

  // Staff-only shell: role dengan transaction:read (owner/manager) diarahkan
  // ke dashboard finansial. Guard ini juga menjadi lapis kedua setelah layout.
  if (can(active.role, "transaction:read")) redirect("/dashboard");

  const overview = await getStaffOverview(user.id, active.business.id);
  const nowMs = overview.nowMs;
  const noBooth = overview.boothCounts.total === 0;
  const stationStatus: BoothStatus = overview.boothCounts.online > 0 ? "online" : "offline";
  const liveCount = overview.activeSessions.length;
  const alertCount = overview.boothCounts.offline + overview.boothCounts.maintenance;

  return (
    <div className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10">
      <StaffPageHeader
        eyebrow={`STATION.CTL · ${STATUS_LABEL[stationStatus]}`}
        title={overview.businessName}
        description="Papan operasional shift: pantau booth, sesi berjalan, dan katalog yang tampil di kiosk. Semua data di halaman ini read-only."
        aside={
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
            <div className="flex min-h-11 items-center justify-between gap-3 border-2 border-ink bg-bg px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Jam stasiun
              </span>
              <StationClock initialMs={nowMs} timeZone={overview.timeZone} />
            </div>
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-2 border-ink bg-bg px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Zona bisnis
              </span>
              <span className="font-mono text-xs font-bold">{overview.timeZone}</span>
            </div>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatusStrip
          icon={Radio}
          label="BOOTH ONLINE"
          value={`${overview.boothCounts.online}/${overview.boothCounts.total}`}
          note={overview.boothCounts.online > 0 ? "siap melayani" : "belum ada yang online"}
          tone={overview.boothCounts.online > 0 ? "ok" : "warn"}
        />
        <StatusStrip
          icon={Clock3}
          label="SESI LIVE"
          value={String(liveCount).padStart(2, "0")}
          note={liveCount === 0 ? "menunggu customer" : "berjalan sekarang"}
          tone="neutral"
        />
        <StatusStrip
          icon={CircleAlert}
          label="PERLU DICEK"
          value={String(alertCount).padStart(2, "0")}
          note={alertCount === 0 ? "semua booth normal" : "offline + maintenance"}
          tone={alertCount > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <StaffPanel aria-labelledby="booth-telemetry">
          <StaffPanelHeader
            label="BOOTH.TELEMETRY"
            meta={`${String(overview.boothCounts.total).padStart(2, "0")} UNIT · ${String(overview.outletCount).padStart(2, "0")} OUTLET`}
          />
          {noBooth ? (
            <div className="p-4 sm:p-5">
              <StaffEmptyState
                icon={Camera}
                eyebrow="BELUM ADA BOOTH"
                title="Belum ada booth yang bisa Anda akses."
                body="Minta owner meng-assign booth ke akun Anda lewat menu Tim, lalu muat ulang halaman ini."
                action={
                  <Link
                    href="/staff/photoboxes"
                    className="inline-flex min-h-11 items-center gap-2 border-2 border-ink bg-accent px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_0_#111111] transition-all duration-100 hover:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                  >
                    Buka halaman booth <ArrowRight className="size-4" aria-hidden />
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="border-2 border-ink bg-accent p-4 shadow-[3px_3px_0_0_#111111]">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
                  BOOTH SIAP JALAN
                </p>
                <p className="mt-2 font-display text-6xl leading-none tracking-[-0.05em] sm:text-7xl">
                  {String(overview.boothCounts.online).padStart(2, "0")}
                </p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em]">
                  dari {String(overview.boothCounts.total).padStart(2, "0")} booth terdaftar
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t-2 border-ink pt-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em]">SESI HARI INI</p>
                    <p className="font-mono text-xl font-bold leading-none">
                      {String(overview.todayCount).padStart(2, "0")}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em]">LIVE SEKARANG</p>
                    <p className="font-mono text-xl font-bold leading-none">
                      {String(liveCount).padStart(2, "0")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <TelemetryCell
                  label="ONLINE"
                  value={overview.boothCounts.online}
                  note="siap jalan"
                  tone="ok"
                />
                <TelemetryCell
                  label="OFFLINE"
                  value={overview.boothCounts.offline}
                  note="perlu dicek"
                  tone="warn"
                />
                <TelemetryCell
                  label="MAINT"
                  value={overview.boothCounts.maintenance}
                  note="sedang servis"
                  tone="danger"
                />
                <TelemetryCell
                  label="TOTAL UNIT"
                  value={overview.boothCounts.total}
                  note="semua booth"
                  tone="neutral"
                />
                <TelemetryCell
                  label="OUTLET"
                  value={overview.outletCount}
                  note="lokasi aktif"
                  tone="neutral"
                />
                <TelemetryCell
                  label="HARI INI"
                  value={overview.todayCount}
                  note="sesi dimulai"
                  tone="neutral"
                />
              </div>
            </div>
          )}
        </StaffPanel>

        <div className="flex flex-col gap-6">
          <StaffPanel aria-labelledby="active-sessions">
            <StaffPanelHeader
              label="ACTIVE.SESSIONS"
              meta={`${String(liveCount).padStart(2, "0")} LIVE`}
            />
            <div className="p-4 sm:p-5">
              {liveCount === 0 ? (
                <div className="border-2 border-dashed border-ink/40 bg-muted px-4 py-5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
                    TIDAK ADA SESI AKTIF
                  </p>
                  <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                    Sesi muncul otomatis setelah customer menyelesaikan pembayaran dan mulai
                    memotret.
                  </p>
                </div>
              ) : (
                <ol className="flex flex-col gap-3">
                  {overview.activeSessions.map((session) => {
                    const started = clockParts(session.started_at, overview.timeZone);
                    return (
                      <li
                        key={session.id}
                        className="border-2 border-ink bg-bg p-3 shadow-[2px_2px_0_0_#111111]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                              {session.outlet_name ?? "TANPA OUTLET"}
                            </p>
                            <p className="truncate font-display text-base font-bold uppercase leading-tight">
                              {session.photobox_name}
                            </p>
                            <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                              {session.package_name ?? "TANPA PACKAGE"}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 border-2 border-ink bg-accent-3 px-1.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em]">
                            <span className="size-1.5 bg-ink" aria-hidden /> LIVE
                          </span>
                        </div>
                        <LiveSessionMeta
                          startedAt={session.started_at}
                          expiresAt={session.expires_at}
                          startedLabel={`${started.time} ${started.zone}`}
                          initialMs={nowMs}
                        />
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </StaffPanel>

          <StaffPanel
            className="bg-ink text-bg shadow-[4px_4px_0_0_#ffd400]"
            aria-labelledby="briefing"
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-bg/25 px-4 py-2.5">
              <h2
                id="briefing"
                className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
              >
                BRIEFING.STANDUP
              </h2>
              <span className="border border-accent px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-accent">
                SHIFT ON
              </span>
            </div>
            <div className="p-4">
              <p className="font-display text-base uppercase leading-tight tracking-tight">
                Customer bayar dulu, lalu sesi dimulai. Cek booth{" "}
                <span className="text-accent">OFFLINE</span> dan minta owner restart bila mati.
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.06em] text-bg/70">
                Tidak ada akses finansial di shell ini. Transaksi dan settlement ditangani owner.
              </p>
            </div>
          </StaffPanel>
        </div>
      </div>

      <StaffPanel aria-labelledby="resources">
        <StaffPanelHeader label="RESOURCE.INDEX" meta="4 MODUL READ-ONLY" />
        <div className="p-4 sm:p-5">
          <h2 id="resources" className="sr-only">
            Modul operasional
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResourceCard
              icon={Camera}
              label="BOOTH"
              count={overview.boothCounts.total}
              href="/staff/photoboxes"
              sub={`${liveCount} sesi aktif`}
            />
            <ResourceCard
              icon={Store}
              label="OUTLET"
              count={overview.outletCount}
              href="/staff/outlets"
              sub="lokasi photobox"
            />
            <ResourceCard
              icon={Package}
              label="PACKAGE"
              count={overview.packageCount}
              href="/staff/packages"
              sub="daftar harga"
            />
            <ResourceCard
              icon={ImageIcon}
              label="TEMPLATE"
              count={overview.templateCount}
              href="/staff/templates"
              sub="frame aktif"
            />
          </div>
          <dl className="mt-4 grid gap-3 border-t-2 border-ink pt-4 sm:grid-cols-3">
            <StaffMeta label="ROLE">{overview.role.toUpperCase()}</StaffMeta>
            <StaffMeta label="PUBLIC PATH">
              <span className="break-all">/p/{overview.businessSlug}</span>
            </StaffMeta>
            <StaffMeta label="AKSES">Read-only · tanpa finansial</StaffMeta>
          </dl>
        </div>
      </StaffPanel>
    </div>
  );
}

function StatusStrip({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "ok" ? "bg-accent-3" : tone === "warn" ? "bg-accent-2" : "bg-surface";
  return (
    <div className="flex min-h-[5.5rem] items-center gap-3 border-2 border-ink bg-surface p-3 shadow-[3px_3px_0_0_#111111]">
      <span
        className={`flex size-10 shrink-0 items-center justify-center border-2 border-ink ${toneClass}`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className="font-mono text-xl font-bold leading-none">{value}</p>
        <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          {note}
        </p>
      </div>
    </div>
  );
}

function TelemetryCell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const accent =
    tone === "ok"
      ? "border-t-accent-3"
      : tone === "warn"
        ? "border-t-accent"
        : tone === "danger"
          ? "border-t-destructive"
          : "border-t-ink";
  return (
    <div className={`border-2 border-t-4 border-ink bg-bg p-3 ${accent}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold leading-none">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
        {note}
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
      className="group flex min-h-[6.5rem] flex-col justify-between border-2 border-ink bg-surface p-3 shadow-[3px_3px_0_0_#111111] transition-all duration-100 hover:-translate-y-[1px] hover:bg-accent hover:shadow-[4px_4px_0_0_#111111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex size-8 items-center justify-center border-2 border-ink bg-bg group-hover:bg-surface">
          <Icon className="size-4" aria-hidden />
        </span>
        <ArrowRight
          className="size-4 transition-transform duration-100 group-hover:translate-x-1"
          aria-hidden
        />
      </span>
      <span className="mt-3 block">
        <span className="flex items-end justify-between gap-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em]">{label}</span>
          <span className="font-mono text-2xl font-bold leading-none">
            {String(count).padStart(2, "0")}
          </span>
        </span>
        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground group-hover:text-ink/70">
          {sub}
        </span>
      </span>
    </Link>
  );
}
