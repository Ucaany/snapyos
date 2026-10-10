import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { reportDevice } from "@/server/devices";
import { deviceReportSchema } from "@/lib/validators";

/** POST /api/v1/public/devices/report — setup wizard laporkan status (docs/05 §5.0.1). */
export async function POST(request: Request) {
  try {
    const input = deviceReportSchema.parse(await request.json());
    return NextResponse.json(dataEnvelope(await reportDevice(input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
