import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api-errors";
import { getResult } from "@/server/kiosk-sessions";

type Props = {
  children: ReactNode;
  params: Promise<{ token: string }>;
};

/**
 * Gerbang 404 untuk /r/[token].
 *
 * `loading.tsx` di segmen ini membuat Suspense boundary: begitu boundary itu
 * menyala, Next mengirim kerangka respons dengan status 200 dan status itu
 * TIDAK bisa diubah lagi. Akibatnya `notFound()` di `page.tsx` hanya mengganti
 * isi body, bukan kode HTTP. Link kedaluwarsa tetap dijawab 200 (terbukti:
 * body memuat skeleton DAN teks "tidak ditemukan" sekaligus).
 *
 * Layout ini dirender DI LUAR boundary tersebut, jadi `notFound()` di sini
 * menetapkan status 404 sebelum satu byte pun dikirim. Skeleton tetap tampil
 * untuk token yang valid.
 *
 * `getResult` dibungkus `cache()` (react) supaya layout dan page berbagi satu
 * query yang sama, bukan dua.
 */
export default async function ResultLayout({ children, params }: Props) {
  const { token } = await params;

  try {
    await getResult(token);
  } catch (cause) {
    // Hanya NOT_FOUND yang jadi 404; gangguan sesaat (DB/storage down) tetap
    // dilempar ke error boundary supaya link yang valid tidak salah dilaporkan
    // "kedaluwarsa" (docs/05 §5.13, docs/09 §9.8).
    if (cause instanceof ApiError && cause.code === "NOT_FOUND") notFound();
    throw cause;
  }

  return children;
}
