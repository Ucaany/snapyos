"use server";

import { headers } from "next/headers";

import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { waLink } from "@/lib/consult";
import { getConsultWhatsApp } from "@/server/consult";
import { ACQUISITION_SOURCES, ACQUISITION_SOURCE_LABELS } from "@/lib/validators";

export type SubscribeState = {
  waUrl?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// Konsultasi berlangganan: 3 kirim / 10 menit per IP (anti-spam).
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 10 * 60_000;

// +62 wajib: hanya nomor Indonesia format +62XXXXXXXXXX.
const PHONE_RE = /^\+62[0-9]{8,13}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitSubscribeAction(
  _prev: SubscribeState,
  formData: FormData
): Promise<SubscribeState> {
  const h = await headers();
  const ip = getClientIp(h);
  const rl = await rateLimit(`subscribe:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return {
      error: `Terlalu banyak percobaan. Coba lagi dalam ${rl.retryAfterSec} detik.`,
    };
  }

  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim().replace(/\s/g, ""),
    email: String(formData.get("email") ?? "").trim(),
    source: String(formData.get("source") ?? ""),
    booths: String(formData.get("booths") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    plan: String(formData.get("plan") ?? "").trim(),
    addons: String(formData.get("addons") ?? "").trim(),
  };

  const fieldErrors: Record<string, string> = {};
  if (raw.name.length < 2) fieldErrors.name = "Nama lengkap wajib diisi.";
  if (!PHONE_RE.test(raw.phone))
    fieldErrors.phone = "Gunakan format +62 (contoh +6281234567890).";
  if (!EMAIL_RE.test(raw.email)) fieldErrors.email = "Format email tidak valid.";
  if (!ACQUISITION_SOURCES.includes(raw.source as (typeof ACQUISITION_SOURCES)[number]))
    fieldErrors.source = "Pilih sumber informasi.";
  const booths = Number(raw.booths);
  if (!Number.isInteger(booths) || booths < 0 || booths > 1000)
    fieldErrors.booths = "Jumlah booth antara 0–1000.";
  if (raw.location.length < 2) fieldErrors.location = "Lokasi / kota wajib diisi.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const sourceLabel =
    ACQUISITION_SOURCE_LABELS[raw.source as keyof typeof ACQUISITION_SOURCE_LABELS];

  const message = [
    "Halo SnapyOS, saya ingin konsultasi berlangganan.",
    "",
    raw.plan ? `Paket: ${raw.plan}` : "Paket: -",
    raw.addons ? `Add-on: ${raw.addons}` : "Add-on: tidak ada",
    "",
    `Nama lengkap: ${raw.name}`,
    `Nomor HP: ${raw.phone}`,
    `Email: ${raw.email}`,
    `Tahu dari: ${sourceLabel}`,
    `Jumlah booth: ${raw.booths}`,
    `Lokasi: ${raw.location}`,
  ].join("\n");

  return { waUrl: waLink(await getConsultWhatsApp(), message) };
}
