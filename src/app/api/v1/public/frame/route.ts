import { NextResponse } from "next/server";

import { isAllowedFrameTarget, type FrameProxyEnv } from "@/lib/frame-proxy";
import { sniffImageType } from "@/lib/upload-validation";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const ALLOWED_FRAME_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

function frameEnv(): FrameProxyEnv {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_BUCKET_BUSINESS_ASSETS: process.env.R2_BUCKET_BUSINESS_ASSETS,
    R2_BUCKET: process.env.R2_BUCKET,
    NODE_ENV: process.env.NODE_ENV,
  };
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return new NextResponse("Missing frame URL", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Invalid frame URL", { status: 400 });
  }

  if (!isAllowedFrameTarget(target, frameEnv())) {
    return new NextResponse("Frame URL is not allowed", { status: 400 });
  }

  const response = await fetch(target, { cache: "no-store", redirect: "error" });
  if (!response.ok) return new NextResponse("Frame unavailable", { status: response.status });

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_FRAME_BYTES) {
    return new NextResponse("Frame too large", { status: 413 });
  }

  const declaredType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_FRAME_MIME.includes(declaredType as (typeof ALLOWED_FRAME_MIME)[number])) {
    return new NextResponse("Frame is not an image", { status: 415 });
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_FRAME_BYTES) {
    return new NextResponse("Frame too large", { status: 413 });
  }
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== declaredType) {
    return new NextResponse("Frame content does not match its type", { status: 415 });
  }

  return new NextResponse(bytes, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": sniffed,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
