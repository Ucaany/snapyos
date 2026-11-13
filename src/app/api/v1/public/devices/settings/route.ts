import { NextResponse } from "next/server";
import { ApiError, dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { rateLimit, rateLimitByDevice } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { updateDeviceSettings } from "@/server/devices";
import {
  deviceSettingsPatchSchema,
  foreignSettingKeys,
  localOnlySettingKeys,
} from "@/lib/validators";

/**
 * PATCH /api/v1/public/devices/settings — booth menulis balik setelan miliknya
 * (Phase 7). Hanya field device: kamera, printer, timer. Harga, `copies`,
 * `payment_mode`, dan `status` tetap milik website.
 */
export async function PATCH(request: Request) {
  try {
    // Token device = bearer; batasi per IP sebelum body dibaca.
    const ip = getClientIp(request.headers);
    const rl = await rateLimit(`device-settings:${ip}`, 30, 60_000, { failOpen: true });
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: rl.retryAfterSec },
          },
        },
        { status: 429 }
      );
    }

    const body = (await request.json()) as unknown;
    // Field cloud diperiksa SEBELUM zod agar pesannya menyebut nama field,
    // bukan sekadar "Input tidak valid" dari `strict()`.
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const settings = (body as { settings?: unknown }).settings;
      if (settings && typeof settings === "object" && !Array.isArray(settings)) {
        // Kustomisasi tampilan hanya hidup di mesin booth. Kalau diterima di
        // sini, satu booth akan menimpa tampilan seluruh booth di business.
        const localOnly = localOnlySettingKeys(settings as Record<string, unknown>);
        if (localOnly.length > 0) {
          throw new ApiError(
            "LOCAL_ONLY_SETTING",
            `Setelan ini hanya berlaku di mesin booth dan tidak disinkronkan: ${localOnly.join(", ")}.`,
            { fields: localOnly }
          );
        }
        const foreign = foreignSettingKeys(settings as Record<string, unknown>);
        if (foreign.length > 0) {
          throw new ApiError(
            "FIELD_NOT_DEVICE_OWNED",
            `Field ini milik website dan tidak bisa diubah dari booth: ${foreign.join(", ")}.`,
            { fields: foreign }
          );
        }
      }
    }

    const input = deviceSettingsPatchSchema.parse(body);
    const deviceRl = await rateLimitByDevice("device-settings", input.device_token, 30, 60_000);
    if (deviceRl && !deviceRl.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            details: { retry_after: deviceRl.retryAfterSec },
          },
        },
        { status: 429 }
      );
    }

    return NextResponse.json(dataEnvelope(await updateDeviceSettings(input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
