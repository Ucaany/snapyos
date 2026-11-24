import { bearerMatches } from "@/lib/cron-auth";
import { formatRevenueDigest, formatRevenueMessage } from "@/lib/revenue-message";
import { resolveSnapyTopicId, sendSnapyTopicHtml } from "@/server/snapyos-telegram";

/**
 * Pratinjau isi notifikasi Telegram (data dummy) — dipakai untuk mengecek
 * tampilan tanpa menunggu transaksi nyata.
 *
 * GET /api/cron/telegram-preview            → revenue + information
 * GET /api/cron/telegram-preview?topic=revenue
 * GET /api/cron/telegram-preview?topic=info
 *
 * Autentikasi: Bearer CRON_SECRET.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.startsWith("change-me")) return false;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.TELEGRAM_PREVIEW_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

const SAMPLE_HISTORY = {
  paidCount: 4,
  lifetimeAmount: 596000,
  lastPaidAt: "2026-10-21T12:30:00Z",
  joinedAt: "2026-09-01T02:00:00Z",
  trialEndsAt: "2026-09-15T02:00:00Z",
  recent: [
    { at: "2026-10-21T12:30:00Z", label: "Pro", amount: 149000 },
    { at: "2026-09-21T12:30:00Z", label: "Pro", amount: 149000 },
    { at: "2026-09-02T04:10:00Z", label: "Pro", amount: 149000 },
  ],
  todayAmount: 298000,
  monthAmount: 1046000,
  activeTrials: 3,
};

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return Response.json(
      { error: { code: "INTERNAL", message: "CRON_SECRET not configured" } },
      { status: 500 }
    );
  }
  if (!authorized(request)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Forbidden" } }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("topic");
  const wanted = requested === "revenue" || requested === "info" ? [requested] : ["revenue", "info"];
  const results: { topic: string; sent: boolean }[] = [];

  if (wanted.includes("revenue")) {
    const samples = [
      `🧪 <b>CONTOH PESAN REVENUE</b> — data dummy, bukan transaksi nyata`,
      formatRevenueMessage({
        kind: "new_subscription",
        businessName: "Klik Foto Studio",
        ownerName: "Budi Santoso",
        ownerEmail: "budi@klikfoto.id",
        planName: "Pro",
        amount: 149000,
        items: [{ label: "Pro (30 hari)", qty: 1, amount: 149000 }],
        invoiceNumber: "INV-202611-0067",
        provider: "pakasir",
        occurredAt: new Date().toISOString(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        history: SAMPLE_HISTORY,
      }),
      formatRevenueMessage({
        kind: "checkout",
        businessName: "Klik Foto Studio",
        ownerName: "Budi Santoso",
        ownerEmail: "budi@klikfoto.id",
        planName: "Pro",
        amount: 149000,
        items: [
          { label: "Pro (30 hari)", qty: 1, amount: 99000 },
          { label: "Tambah Storage 1.024 MB", qty: 1, amount: 50000 },
        ],
        invoiceNumber: "INV-202611-0068",
        occurredAt: new Date().toISOString(),
        history: SAMPLE_HISTORY,
      }),
      formatRevenueMessage({
        kind: "trial",
        businessName: "Booth Ceria Malang",
        ownerName: "Rina",
        ownerEmail: "rina@boothceria.id",
        planName: "Starter",
        amount: 0,
        trialDays: 14,
        occurredAt: new Date().toISOString(),
        history: {
          paidCount: 0,
          lifetimeAmount: 0,
          recent: [],
          joinedAt: new Date().toISOString(),
          trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          activeTrials: 3,
          todayAmount: 298000,
          monthAmount: 1046000,
        },
      }),
      formatRevenueMessage({
        kind: "cancelled",
        businessName: "Snap Corner Bandung",
        ownerName: "Dewi",
        ownerEmail: "dewi@snapcorner.id",
        occurredAt: new Date().toISOString(),
        periodEnd: new Date(Date.now() + 12 * 86_400_000).toISOString(),
        history: SAMPLE_HISTORY,
      }),
      formatRevenueDigest({
        periodLabel: new Date().toLocaleDateString("id-ID", {
          timeZone: "Asia/Jakarta",
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        revenueToday: 298000,
        transactionsToday: 2,
        revenueMonth: 1046000,
        transactionsMonth: 7,
        newTrialsToday: 1,
        activeTrials: 3,
        byKind: [
          { label: "Pro (30 hari)", count: 1, amount: 149000 },
          { label: "Template premium", count: 1, amount: 149000 },
        ],
        topBusinesses: [{ name: "Klik Foto Studio", amount: 298000 }],
      }),
    ];
    for (const text of samples) {
      results.push({ topic: "revenue", sent: await sendSnapyTopicHtml(text, "revenue") });
    }
  }

  if (wanted.includes("info")) {
    const infoSamples = [
      `🧪 <b>CONTOH PESAN INFORMATION</b> — data dummy`,
      [
        `🔐 <b>Login berhasil</b>`,
        `👤 Akun: <code>budi@klikfoto.id</code>`,
        `🪪 Role: owner`,
        `🔑 Metode: password`,
        `🌐 IP: <code>103.28.14.77</code>`,
        `💻 Browser/perangkat: Chrome · Windows`,
        `🕒 Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
      ].join("\n"),
      [`🔔 <b>User baru ditambahkan</b>`, `Owner: Rina`, `Status: manager`].join("\n"),
    ];
    for (const text of infoSamples) {
      results.push({ topic: "info", sent: await sendSnapyTopicHtml(text, "info") });
    }
  }

  return Response.json({
    ok: true,
    targets: Object.fromEntries(
      (["revenue", "info"] as const).map((topic) => [topic, resolveSnapyTopicId(topic) ?? null])
    ),
    results,
  });
}
