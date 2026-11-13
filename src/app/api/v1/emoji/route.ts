import { NextResponse } from "next/server";
import { REVALIDATE_ONE_HOUR as REVALIDATE_SECONDS } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

/**
 * Emoji API proxy — docs/05 §5.9 (sticker/emoji picker kiosk).
 * Server-side proxy ke https://emoji-api.com agar API key tidak ter-expose ke client.
 * Caching hanya via Next.js edge revalidate (no in-memory Map → no unbounded growth).
 *
 * GET /api/v1/emoji?search=heart — cari emoji
 * GET /api/v1/emoji — daftar emoji populer
 */

type EmojiApiItem = {
  slug?: string;
  character?: string;
  name?: string;
  group?: string;
};

function toEmoji(e: EmojiApiItem) {
  return {
    char: e.character ?? "",
    name: e.name ?? e.slug ?? "",
    group: e.group ?? "",
  };
}

export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`emoji:${ip}`, 60, 60_000, { failOpen: true });
  if (!rl.ok) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi nanti." } },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit")) || 120, 300);

  const apiKey = process.env.EMOJI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ data: [] });
  }

  const base = "https://emoji-api.com/emojis";
  const url = search
    ? `${base}?search=${encodeURIComponent(search)}&access_key=${apiKey}`
    : `${base}?access_key=${apiKey}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: { code: "EXTERNAL_ERROR", message: "Gagal memuat emoji." } },
        { status: 502 }
      );
    }

    const raw = (await res.json()) as EmojiApiItem[];
    const items = Array.isArray(raw) ? raw : [];
    const data = items
      .filter((e) => e.character)
      .slice(0, limit)
      .map(toEmoji);

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: { code: "NETWORK_ERROR", message: "Tidak dapat terhubung ke Emoji API." } },
      { status: 502 }
    );
  }
}
