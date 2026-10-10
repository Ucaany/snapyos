"use server";

import { headers } from "next/headers";

import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { waLink } from "@/lib/consult";
import { getConsultWhatsApp } from "@/server/consult";

export type ContactState = {
  waUrl?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 10 * 60_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const h = await headers();
  const ip = getClientIp(h);
  const rl = await rateLimit(`contact:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return {
      error: `Terlalu banyak percobaan. Coba lagi dalam ${rl.retryAfterSec} detik.`,
    };
  }

  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim(),
  };

  const fieldErrors: Record<string, string> = {};
  if (raw.name.length < 2) fieldErrors.name = "Nama wajib diisi.";
  if (!EMAIL_RE.test(raw.email)) fieldErrors.email = "Format email tidak valid.";
  if (raw.message.length < 10)
    fieldErrors.message = "Pesan minimal 10 karakter agar bisa ditindaklanjuti.";
  if (raw.message.length > 2000) fieldErrors.message = "Pesan maksimal 2000 karakter.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const message = [
    "Halo SnapyOS, saya ingin bertanya tentang booth photobox.",
    "",
    `Nama: ${raw.name}`,
    `Email: ${raw.email}`,
    `Pesan: ${raw.message.slice(0, 1000)}`,
  ].join("\n");

  return { waUrl: waLink(await getConsultWhatsApp(), message) };
}
