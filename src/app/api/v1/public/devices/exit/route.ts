import { NextResponse } from "next/server"
import { dataEnvelope } from "@/lib/api-errors"
import { toErrorResponse } from "@/lib/api-route"
import { verifyDeviceExit } from "@/server/devices"
import { deviceExitSchema } from "@/lib/validators"

/** POST /api/v1/public/devices/exit — PIN petugas untuk keluar mode kiosk (docs/05 §5.0). */
export async function POST(request: Request) {
  try {
    const input = deviceExitSchema.parse(await request.json())
    return NextResponse.json(dataEnvelope(await verifyDeviceExit(input)))
  } catch (error) {
    return toErrorResponse(error)
  }
}
