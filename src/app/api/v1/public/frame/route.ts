import { NextResponse } from "next/server";

function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const r2Endpoint = process.env.R2_ENDPOINT?.trim();
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  for (const value of [supabaseUrl, r2Endpoint]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      continue;
    }
  }
  if (accountId) origins.add(`https://${accountId}.r2.cloudflarestorage.com`);
  return origins;
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

  if (!allowedOrigins().has(target.origin) || !["http:", "https:"].includes(target.protocol)) {
    return new NextResponse("Frame URL is not allowed", { status: 400 });
  }

  const response = await fetch(target, { cache: "no-store" });
  if (!response.ok) return new NextResponse("Frame unavailable", { status: response.status });

  const contentType = response.headers.get("content-type") ?? "image/png";
  if (!contentType.startsWith("image/")) return new NextResponse("Frame is not an image", { status: 415 });

  return new NextResponse(response.body, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
