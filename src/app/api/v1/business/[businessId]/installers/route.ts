import { authRoute, parseUuidParam, searchParamsToObject } from "@/lib/api-route";
import { installerQuerySchema } from "@/lib/validators";
import { listOwnerInstallers } from "@/server/installers";

type Params = { businessId: string };

export const GET = authRoute<Awaited<ReturnType<typeof listOwnerInstallers>>, Params>(
  async ({ user, request, params }) => {
    const businessId = parseUuidParam(params.businessId, "businessId");
    const query = installerQuerySchema.parse(searchParamsToObject(request));
    return listOwnerInstallers(user.id, businessId, query.windows, query.architecture);
  }
);
