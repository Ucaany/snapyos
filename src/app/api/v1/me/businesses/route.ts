import { authRoute } from "@/lib/api-route";
import { listBusinesses } from "@/server/business";

/** GET /api/v1/me/businesses — daftar business user (docs/08 §8.4). */
export const GET = authRoute(async ({ user }) => {
  return listBusinesses(user.id);
});
