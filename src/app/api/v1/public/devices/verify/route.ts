import { NextResponse } from "next/server";
import { dataEnvelope } from "@/lib/api-errors";
import { toErrorResponse } from "@/lib/api-route";
import { verifyDevice } from "@/server/devices";
import { deviceVerifySchema } from "@/lib/validators";

/** POST /api/v1/public/devices/verify (docs/08 §8.14). */
export async function POST(request: Request) {
  try {
    const input = deviceVerifySchema.parse(await request.json());
    return NextResponse.json(dataEnvelope(await verifyDevice(input)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
