/**
 * Admin Businesses — docs/10 §10.2 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { adminBusinessUpdateSchema } from "@/lib/validators";
import { likePattern } from "@/lib/postgrest-search";
import { requireAdmin, audit } from "./guard";
import { getStorageUsageBatch } from "@/server/storage-usage";
import { activeStorageProviders } from "@/server/storage";
import { summarizeBooths, BOOTH_STALE_MINUTES } from "@/lib/booth-health";
import { isDeviceOnline } from "@/lib/device-online";
import type { StorageBucket } from "@/server/storage/types";

const STORAGE_BUCKETS: StorageBucket[] = ["business-assets", "generated-photos"];
/** Batas aman iterasi listing per direktori (cegah loop tak berujung). */
const SWEEP_MAX_PAGES = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminBusinessRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
  owner_email: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  usage: { outlets: number; photoboxes: number; sessions: number; transactions: number };
  booths: { total: number; online: number; offline: number; maintenance: number };
  lastHeartbeatAt: string | null;
  storage: { usedMb: number; limitMb: number; percent: number; isFull: boolean };
};

// ---------------------------------------------------------------------------
// Aggregate stats untuk KPI halaman Tenant
// ---------------------------------------------------------------------------

export type AdminBusinessStats = {
  total: number;
  active: number;
  suspended: number;
  outlets: number;
  photoboxes: number;
  sessions: number;
  transactions: number;
  boothsOnline: number;
  boothsMaintenance: number;
};

/** Agregat seluruh tenant untuk KPI `/admin/businesses`. */
export async function getBusinessStats(): Promise<AdminBusinessStats> {
  await requireAdmin();
  const supabase = createServerClient();
  const [biz, outlets, photoboxes, sessions, transactions, boxes] = await Promise.all([
    supabase.from("businesses").select("status"),
    supabase.from("outlets").select("id", { count: "exact", head: true }),
    supabase.from("photoboxes").select("id", { count: "exact", head: true }),
    supabase.from("sessions").select("id", { count: "exact", head: true }),
    supabase.from("transactions").select("id", { count: "exact", head: true }),
    supabase.from("photoboxes").select("id, status"),
  ]);
  if (
    biz.error ||
    outlets.error ||
    photoboxes.error ||
    sessions.error ||
    transactions.error ||
    boxes.error
  ) {
    throw new ApiError("INTERNAL", "Gagal memuat statistik bisnis");
  }

  const rows = (biz.data ?? []) as unknown as { status: string }[];
  const boxRows = (boxes.data ?? []) as unknown as { id: string; status: string }[];
  const heartbeatByBox = new Map<string, string>();
  if (boxRows.length > 0) {
    const { data: deviceRows } = await supabase
      .from("devices")
      .select("photobox_id, last_seen_at, last_heartbeat_at")
      .eq("status", "active")
      .in(
        "photobox_id",
        boxRows.map((b) => b.id)
      );
    for (const d of (deviceRows ?? []) as unknown as {
      photobox_id: string;
      last_seen_at: string | null;
      last_heartbeat_at: string | null;
    }[]) {
      const latest = d.last_heartbeat_at ?? d.last_seen_at;
      if (!latest) continue;
      const prev = heartbeatByBox.get(d.photobox_id);
      if (!prev || Date.parse(latest) > Date.parse(prev)) {
        heartbeatByBox.set(d.photobox_id, latest);
      }
    }
  }
  const boothSummary = summarizeBooths(
    boxRows.map((b) => ({ status: b.status, lastHeartbeatAt: heartbeatByBox.get(b.id) ?? null })),
    Date.now()
  );

  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    suspended: rows.filter((r) => r.status === "suspended").length,
    outlets: outlets.count ?? 0,
    photoboxes: photoboxes.count ?? 0,
    sessions: sessions.count ?? 0,
    transactions: transactions.count ?? 0,
    boothsOnline: boothSummary.online,
    boothsMaintenance: boothSummary.maintenance,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listBusinesses(query: {
  search?: string;
  status?: "active" | "suspended";
  page?: number;
  limit?: number;
}): Promise<{ items: AdminBusinessRow[]; total: number; nowMs: number }> {
  await requireAdmin();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const nowMs = Date.now();

  const supabase = createServerClient();
  let req = supabase
    .from("businesses")
    .select(
      "id, name, slug, status, created_at, users ( email ), subscriptions ( status, plans ( name ) )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (query.status) {
    req = req.eq("status", query.status);
  }
  if (query.search) {
    const like = likePattern(query.search);
    req = req.or(`name.ilike.${like},slug.ilike.${like}`);
  }
  const { data, error, count } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat businesses");

  type Row = {
    id: string;
    name: string;
    slug: string;
    status: "active" | "suspended";
    created_at: string;
    users: { email: string } | { email: string }[] | null;
    subscriptions:
      | { status: string; plans: { name: string } | { name: string }[] | null }[]
      | { status: string; plans: { name: string } | { name: string }[] | null }
      | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Batch usage seluruh halaman: 4 query agregat (bukan 4 per baris, anti N+1).
  const ids = rows.map((r) => r.id);
  const usageById = new Map<string, AdminBusinessRow["usage"]>();
  const boothsById = new Map<string, AdminBusinessRow["booths"]>();
  const heartbeatById = new Map<string, string | null>();
  if (ids.length > 0) {
    const [outlets, sessions, transactions, boothRows] = await Promise.all([
      supabase.from("outlets").select("business_id").in("business_id", ids),
      supabase.from("sessions").select("business_id").in("business_id", ids),
      supabase.from("transactions").select("business_id").in("business_id", ids),
      supabase.from("photoboxes").select("id, business_id, status").in("business_id", ids),
    ]);
    const tally = (res: { data: { business_id: string }[] | null }) => {
      const m = new Map<string, number>();
      for (const r of res.data ?? []) m.set(r.business_id, (m.get(r.business_id) ?? 0) + 1);
      return m;
    };
    const o = tally(outlets);
    const s = tally(sessions);
    const t = tally(transactions);
    const boxRows = (boothRows.data ?? []) as unknown as {
      id: string;
      business_id: string;
      status: string;
    }[];
    const p = new Map<string, number>();
    for (const b of boxRows) p.set(b.business_id, (p.get(b.business_id) ?? 0) + 1);
    for (const id of ids) {
      usageById.set(id, {
        outlets: o.get(id) ?? 0,
        photoboxes: p.get(id) ?? 0,
        sessions: s.get(id) ?? 0,
        transactions: t.get(id) ?? 0,
      });
    }

    // Heartbeat device aktif per booth: satu query, lalu agregasi per bisnis.
    const boxIds = boxRows.map((b) => b.id);
    const heartbeatByBox = new Map<string, string>();
    if (boxIds.length > 0) {
      const { data: deviceRows } = await supabase
        .from("devices")
        .select("photobox_id, last_seen_at, last_heartbeat_at")
        .eq("status", "active")
        .in("photobox_id", boxIds);
      for (const row of (deviceRows ?? []) as unknown as {
        photobox_id: string;
        last_seen_at: string | null;
        last_heartbeat_at: string | null;
      }[]) {
        const latest = row.last_heartbeat_at ?? row.last_seen_at;
        if (!latest) continue;
        const previous = heartbeatByBox.get(row.photobox_id);
        if (!previous || Date.parse(latest) > Date.parse(previous)) {
          heartbeatByBox.set(row.photobox_id, latest);
        }
      }
    }

    const nowMsInner = nowMs;
    for (const id of ids) {
      const boxes = boxRows.filter((b) => b.business_id === id);
      const summary = summarizeBooths(
        boxes.map((b) => ({ status: b.status, lastHeartbeatAt: heartbeatByBox.get(b.id) ?? null })),
        nowMsInner
      );
      boothsById.set(id, summary);
      let latest: string | null = null;
      for (const box of boxes) {
        const hb = heartbeatByBox.get(box.id);
        if (hb && (!latest || Date.parse(hb) > Date.parse(latest))) latest = hb;
      }
      heartbeatById.set(id, latest);
    }
  }

  // Storage usage (0053/0062) — satu query batch counter + satu query batch
  // kuota (anti N+1). TIDAK merekonsiliasi dari listing R2 di list page —
  // backfill/cron yang mengisi baris counter bisnis lama.
  const storageById = new Map<string, AdminBusinessRow["storage"]>();
  if (ids.length > 0) {
    const batch = await getStorageUsageBatch(ids);
    for (const [id, s] of batch) {
      storageById.set(id, {
        usedMb: s.usedMb,
        limitMb: s.limitMb,
        percent: s.percent,
        isFull: s.isFull,
      });
    }
  }

  const items: AdminBusinessRow[] = [];
  for (const row of rows) {
    const owner = Array.isArray(row.users) ? row.users[0] : row.users;
    const subs = Array.isArray(row.subscriptions)
      ? row.subscriptions
      : [row.subscriptions].filter(Boolean);
    const latest = subs[0];
    const plan = latest && !Array.isArray(latest.plans) ? latest.plans : null;
    items.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      owner_email: owner?.email ?? null,
      plan_name: plan?.name ?? null,
      subscription_status: latest?.status ?? null,
      usage: usageById.get(row.id) ?? { outlets: 0, photoboxes: 0, sessions: 0, transactions: 0 },
      booths: boothsById.get(row.id) ?? { total: 0, online: 0, offline: 0, maintenance: 0 },
      lastHeartbeatAt: heartbeatById.get(row.id) ?? null,
      storage: storageById.get(row.id) ?? { usedMb: 0, limitMb: 0, percent: 0, isFull: false },
    });
  }
  return { items, total: count ?? 0, nowMs };
}

export async function getBusinessUsage(businessId: string) {
  // K5: guard admin (audit 2026-09-16). Sebelumnya fungsi ini di-invoke lewat
  // GET /api/v1/admin/businesses/:id tanpa auth check apa pun.
  await requireAdmin();
  const supabase = createServerClient();
  // K6: pastikan business exists — kembalikan 404, jangan zeros palsu.
  const { data: exists, error: existsErr } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .maybeSingle();
  if (existsErr) throw new ApiError("INTERNAL", "Gagal memuat business");
  if (!exists) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const [outlets, photoboxes, sessions, transactions] = await Promise.all([
    supabase
      .from("outlets")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    supabase
      .from("photoboxes")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);
  return {
    outlets: outlets.count ?? 0,
    photoboxes: photoboxes.count ?? 0,
    sessions: sessions.count ?? 0,
    transactions: transactions.count ?? 0,
  };
}

export type AdminBusinessDetailBooth = {
  id: string;
  name: string;
  slug: string;
  status: string;
  outletId: string;
  outletName: string | null;
  lastHeartbeatAt: string | null;
  online: boolean;
  stale: boolean;
  deviceCount: number;
  onlineDevices: number;
  sessions: number;
  transactions: number;
};

export type AdminBusinessDetailTransaction = {
  id: string;
  number: string;
  amount: number;
  status: string;
  method: string;
  boothName: string;
  paidAt: string | null;
  createdAt: string;
};

export type AdminBusinessDetailDevice = {
  id: string;
  boothId: string;
  boothName: string;
  name: string | null;
  status: string;
  online: boolean;
  lastHeartbeatAt: string | null;
  kioskLocked: boolean;
  runtimeVersion: string | null;
  camera: { adapter: string | null; connected: boolean } | null;
  printer: {
    adapter: string | null;
    ok: boolean;
    mode: string | null;
    state: string | null;
    media: string | null;
    queue: number | null;
    job: string | null;
    reportedAt: string | null;
  } | null;
  createdAt: string;
};

export type AdminBusinessDetail = {
  business: {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    timezone: string;
    contact_email: string | null;
    whatsapp: string | null;
    address: string | null;
    owner_name: string | null;
    owner_email: string | null;
  };
  subscription: {
    plan_name: string | null;
    status: string | null;
    current_period_end: string | null;
  };
  outlets: { id: string; name: string; city: string | null; status: string }[];
  booths: AdminBusinessDetailBooth[];
  devices: AdminBusinessDetailDevice[];
  transactions: AdminBusinessDetailTransaction[];
  usage: { outlets: number; photoboxes: number; sessions: number; transactions: number };
  storage: { usedMb: number; limitMb: number; percent: number; isFull: boolean };
  nowMs: number;
};

/** Detail tenant: profil, langganan, booth + heartbeat live, transaksi terakhir. */
export async function getBusinessDetail(businessId: string): Promise<AdminBusinessDetail> {
  await requireAdmin();
  const supabase = createServerClient();

  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .select(
      "id, name, slug, status, created_at, timezone, contact_email, whatsapp, address, owner_name, users ( email ), subscriptions ( status, current_period_end, plans ( name ) )"
    )
    .eq("id", businessId)
    .maybeSingle();
  if (bizErr) throw new ApiError("INTERNAL", "Gagal memuat business");
  if (!biz) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  type BizRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    timezone: string;
    contact_email: string | null;
    whatsapp: string | null;
    address: string | null;
    owner_name: string | null;
    users: { email: string } | { email: string }[] | null;
    subscriptions:
      | {
          status: string;
          current_period_end: string | null;
          plans: { name: string } | { name: string }[] | null;
        }[]
      | {
          status: string;
          current_period_end: string | null;
          plans: { name: string } | { name: string }[] | null;
        }
      | null;
  };
  const row = biz as unknown as BizRow;
  const owner = Array.isArray(row.users) ? row.users[0] : row.users;
  const subs = Array.isArray(row.subscriptions)
    ? row.subscriptions
    : [row.subscriptions].filter(Boolean);
  const latestSub = subs[0];
  const plan = latestSub && !Array.isArray(latestSub.plans) ? latestSub.plans : null;

  const [outlets, boxes, txRows, sessionRows, txCount, storage] = await Promise.all([
    supabase
      .from("outlets")
      .select("id, name, city, status")
      .eq("business_id", businessId)
      .order("name"),
    supabase
      .from("photoboxes")
      .select("id, name, slug, status, outlet_id, outlets ( name )")
      .eq("business_id", businessId)
      .order("name"),
    supabase
      .from("transactions")
      .select("id, number, final_amount, status, payment_method, paid_at, created_at, photobox_id")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("sessions").select("photobox_id").eq("business_id", businessId),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    getStorageUsageBatch([businessId]).then((map) => map.get(businessId)),
  ]);

  const boxRows = (boxes.data ?? []) as unknown as {
    id: string;
    name: string;
    slug: string;
    status: string;
    outlet_id: string;
    outlets: { name: string } | { name: string }[] | null;
  }[];
  const boxIds = boxRows.map((b) => b.id);

  // Device + heartbeat: satu query untuk semua booth tenant ini.
  const deviceRows =
    boxIds.length > 0
      ? (
          await supabase
            .from("devices")
            .select(
              "id, photobox_id, name, status, last_seen_at, last_heartbeat_at, kiosk_locked, diagnostics, created_at"
            )
            .eq("business_id", businessId)
            .eq("status", "active")
            .in("photobox_id", boxIds)
            .order("created_at", { ascending: false })
        ).data
      : [];
  type DeviceRow = {
    id: string;
    photobox_id: string;
    name: string | null;
    status: string;
    last_seen_at: string | null;
    last_heartbeat_at: string | null;
    kiosk_locked: boolean;
    diagnostics: Record<string, unknown> | null;
    created_at: string;
  };
  const deviceList = (deviceRows ?? []) as unknown as DeviceRow[];
  const devicesByBox = new Map<string, DeviceRow[]>();
  for (const d of deviceList) {
    const list = devicesByBox.get(d.photobox_id) ?? [];
    list.push(d);
    devicesByBox.set(d.photobox_id, list);
  }

  const nowMs = Date.now();
  const txByBox = new Map<string, number>();
  for (const t of (txRows.data ?? []) as unknown as { photobox_id: string }[]) {
    txByBox.set(t.photobox_id, (txByBox.get(t.photobox_id) ?? 0) + 1);
  }
  const sessionsByBox = new Map<string, number>();
  for (const s of (sessionRows.data ?? []) as unknown as { photobox_id: string }[]) {
    sessionsByBox.set(s.photobox_id, (sessionsByBox.get(s.photobox_id) ?? 0) + 1);
  }

  const boothList: AdminBusinessDetailBooth[] = boxRows.map((box) => {
    const devices = devicesByBox.get(box.id) ?? [];
    let latest: string | null = null;
    let onlineDevices = 0;
    for (const d of devices) {
      const hb = d.last_heartbeat_at ?? d.last_seen_at;
      if (hb && (!latest || Date.parse(hb) > Date.parse(latest))) latest = hb;
      if (isDeviceOnline(d.status, d.last_seen_at, d.last_heartbeat_at, nowMs)) onlineDevices += 1;
    }
    return {
      id: box.id,
      name: box.name,
      slug: box.slug,
      status: box.status,
      outletId: box.outlet_id,
      outletName: (Array.isArray(box.outlets) ? box.outlets[0] : box.outlets)?.name ?? null,
      lastHeartbeatAt: latest,
      online: onlineDevices > 0 && box.status !== "maintenance",
      stale:
        box.status !== "maintenance" &&
        latest !== null &&
        nowMs - Date.parse(latest) >= BOOTH_STALE_MINUTES * 60_000,
      deviceCount: devices.length,
      onlineDevices,
      sessions: sessionsByBox.get(box.id) ?? 0,
      transactions: txByBox.get(box.id) ?? 0,
    };
  });

  const boxNameById = new Map(boxRows.map((b) => [b.id, b.name]));
  const devices: AdminBusinessDetailDevice[] = deviceList.map((d) => {
    const diag = (d.diagnostics ?? {}) as {
      runtime?: {
        runtime_version?: string;
        camera?: { adapter?: string; connected?: boolean };
        printer?: {
          adapter?: string;
          ok?: boolean;
          mode?: string;
          state?: string;
          media?: string;
          queue?: number;
          job?: string;
          reported_at?: string;
        };
      };
      camera?: { adapter?: string; connected?: boolean };
      printer?: {
        adapter?: string;
        ok?: boolean;
        mode?: string;
        state?: string;
        media?: string;
        queue?: number;
        job?: string;
        reported_at?: string;
      };
    };
    const camera = diag.runtime?.camera ?? diag.camera ?? null;
    const printer = diag.runtime?.printer ?? diag.printer ?? null;
    return {
      id: d.id,
      boothId: d.photobox_id,
      boothName: boxNameById.get(d.photobox_id) ?? "-",
      name: d.name,
      status: d.status,
      online: isDeviceOnline(d.status, d.last_seen_at, d.last_heartbeat_at, nowMs),
      lastHeartbeatAt: d.last_heartbeat_at ?? d.last_seen_at,
      kioskLocked: d.kiosk_locked,
      runtimeVersion: diag.runtime?.runtime_version ?? null,
      camera: camera
        ? { adapter: camera.adapter ?? null, connected: camera.connected === true }
        : null,
      printer: printer
        ? {
            adapter: printer.adapter ?? null,
            ok: printer.ok === true,
            mode: printer.mode ?? null,
            state: printer.state ?? null,
            media: printer.media ?? null,
            queue: typeof printer.queue === "number" ? printer.queue : null,
            job: printer.job ?? null,
            reportedAt: printer.reported_at ?? null,
          }
        : null,
      createdAt: d.created_at,
    };
  });

  const transactions: AdminBusinessDetailTransaction[] = (
    (txRows.data ?? []) as unknown as {
      id: string;
      number: string;
      final_amount: number;
      status: string;
      payment_method: string;
      paid_at: string | null;
      created_at: string;
      photobox_id: string;
    }[]
  ).map((t) => ({
    id: t.id,
    number: t.number,
    amount: t.final_amount,
    status: t.status,
    method: t.payment_method,
    boothName: boxNameById.get(t.photobox_id) ?? "-",
    paidAt: t.paid_at,
    createdAt: t.created_at,
  }));

  return {
    business: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      timezone: row.timezone,
      contact_email: row.contact_email,
      whatsapp: row.whatsapp,
      address: row.address,
      owner_name: row.owner_name,
      owner_email: owner?.email ?? null,
    },
    subscription: {
      plan_name: plan?.name ?? null,
      status: latestSub?.status ?? null,
      current_period_end: latestSub?.current_period_end ?? null,
    },
    outlets: (
      (outlets.data ?? []) as unknown as {
        id: string;
        name: string;
        city: string | null;
        status: string;
      }[]
    ).map((o) => ({ id: o.id, name: o.name, city: o.city, status: o.status })),
    booths: boothList,
    devices,
    transactions,
    usage: {
      outlets: outlets.data?.length ?? 0,
      photoboxes: boxRows.length,
      sessions: sessionRows.data?.length ?? 0,
      transactions: txCount.count ?? 0,
    },
    storage: storage ?? { usedMb: 0, limitMb: 0, percent: 0, isFull: false },
    nowMs,
  };
}

/**
 * Hapus SEMUA object business dari setiap provider/bucket yang terkonfigurasi
 * (R2 baru + Supabase legacy). Rekursif di bawah prefix `<businessId>/`.
 *
 * Storage-first: dipanggil SEBELUM menghapus baris `businesses` supaya tak ada
 * object tertinggal. Idempotent — object yang sudah absen tak masalah.
 * Mengumpulkan key per-provider lalu satu `remove()` batch per provider.
 * Aman di-log: hanya jumlah key + pesan error (tanpa signed URL/kredensial).
 */
async function purgeBusinessStorage(
  businessId: string
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const provider of activeStorageProviders()) {
    for (const bucket of STORAGE_BUCKETS) {
      const keys: string[] = [];
      const stack: string[] = [businessId];
      let pages = 0;
      while (stack.length > 0 && pages < SWEEP_MAX_PAGES) {
        pages++;
        const dir = stack.pop()!;
        let offset = 0;
        for (;;) {
          const { data, error } = await provider.list(bucket, dir, { limit: 1000, offset });
          if (error) {
            // Listing gagal → tandai gagal; JANGAN lanjut hapus DB agar object
            // tidak tertinggal. Caller menahan deletion & retry.
            console.error(
              `[admin/businesses] list gagal bucket=${bucket} dir=${dir}:`,
              error.message
            );
            throw new ApiError("INTERNAL", "Gagal menyapu storage business");
          }
          const items = data ?? [];
          for (const it of items) {
            if (it.id) keys.push(`${dir}/${it.name}`);
            else stack.push(`${dir}/${it.name}`);
          }
          offset += items.length;
          if (items.length < 1000) break;
        }
      }
      if (keys.length > 0) {
        const { error } = await provider.remove(bucket, keys);
        if (error) {
          console.error(`[admin/businesses] remove gagal bucket=${bucket}:`, error.message);
          failed += keys.length;
        } else {
          removed += keys.length;
        }
      }
    }
  }
  return { removed, failed };
}

/**
 * Putuskan satu device tenant dari halaman admin. Baris device dihapus, jadi
 * kiosk kehilangan token dan harus pairing ulang. Filter business_id mencegah
 * admin memutus device tenant lain lewat id.
 */
export async function revokeBusinessDevice(businessId: string, deviceId: string) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("devices")
    .delete()
    .eq("id", deviceId)
    .eq("business_id", businessId)
    .select("id, name, photobox_id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memutus perangkat");
  if (!data) throw new ApiError("NOT_FOUND", "Perangkat tidak ditemukan");

  await audit(
    admin.id,
    "admin.business.device.revoke",
    businessId,
    { deviceId, name: data.name, photoboxId: data.photobox_id },
    businessId
  );
  return { id: deviceId };
}

/**
 * Hapus business beserta seluruh data terkait (admin). Urutan:
 *  1. Sapu storage (semua provider/bucket) — jangan tinggalkan orphan object.
 *  2. Hapus baris `businesses` → cascade seluruh tabel anak (sessions,
 *     transactions, photos, members, settings, dst.).
 * Bila penyapuan storage gagal (`failed>0`) → batalkan (throw) agar admin
 * bisa retry; baris DB TIDAK dihapus selama object masih ada.
 */
export async function deleteBusiness(businessId: string) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data: exists } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .maybeSingle();
  if (!exists) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const { removed, failed } = await purgeBusinessStorage(businessId);
  if (failed > 0) {
    throw new ApiError(
      "INTERNAL",
      "Sebagian object storage gagal dihapus. Coba lagi (idempotent)."
    );
  }

  const { error } = await supabase.from("businesses").delete().eq("id", businessId);
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus business");

  await audit(admin.id, "admin.business.delete", businessId, {
    name: (exists as { name: string }).name,
    removedObjects: removed,
  });
  return { id: businessId, removedObjects: removed };
}

export async function updateBusiness(
  businessId: string,
  input: { status: "active" | "suspended" }
) {
  const admin = await requireAdmin();
  const parsed = adminBusinessUpdateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .update(parsed)
    .eq("id", businessId)
    .select("id, name, slug, status, created_at")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui business");
  if (!data) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  if (parsed.status === "suspended") {
    // Revoke sesi semua member business (owner + staff) — suspend langsung
    // mematikan akses dashboard (docs/09 §10, pola sama dengan updateUser).
    const { data: members } = await supabase
      .from("business_members")
      .select("user_id")
      .eq("business_id", businessId);
    const userIds = (members ?? []).map((m) => m.user_id);
    if (userIds.length > 0) {
      await supabase.from("auth_sessions").delete().in("user_id", userIds);
    }
  }
  await audit(admin.id, "admin.business.update", businessId, { ...parsed }, businessId);
  return data;
}
