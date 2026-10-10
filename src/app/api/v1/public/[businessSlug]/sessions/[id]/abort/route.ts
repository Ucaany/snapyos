import { NextResponse } from "next/server"
import { dataEnvelope } from "@/lib/api-errors"
import { toErrorResponse } from "@/lib/api-route"
import { abortSession } from "@/server/kiosk-sessions"
import { sessionAbortSchema } from "@/lib/validators"

/** POST /api/v1/public/:businessSlug/sessions/:id/abort — kiosk buang sesi aktifnya sendiri. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessSlug: string; id: string }> }
) {
  try {
    const { businessSlug, id } = await params
    const input = sessionAbortSchema.parse(await request.json())
    return NextResponse.json(dataEnvelope(await abortSession(businessSlug, id, input)))
  } catch (error) {
    return toErrorResponse(error)
  }
}
