import { authRoute } from "@/lib/api-route";
import { createBusiness } from "@/server/business";
import { businessCreateSchema } from "@/lib/validators";

/** POST /api/v1/businesses — buat business ({ name, slug? }) (docs/08 §8.4). */
export const POST = authRoute(
  async ({ user, request }) => {
    const input = businessCreateSchema.parse(await request.json());
    return createBusiness(user.id, input);
  },
  { status: 201 }
);
