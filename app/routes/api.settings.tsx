import { getDb } from "~/db";
import { setUserServices } from "~/services/settings.server";
import type { Route } from "./+types/api.settings";

export async function action({ request, context }: Route.ActionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const formData = await request.formData();
  const providerIdsRaw = formData.get("providerIds") as string;

  const providerIds: number[] = providerIdsRaw
    ? JSON.parse(providerIdsRaw)
    : [];

  await setUserServices(db, providerIds);

  return { success: true };
}
