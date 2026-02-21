import { eq } from "drizzle-orm";
import type { Database } from "~/db";
import { schema } from "~/db";
import { STREAMING_SERVICES } from "~/lib/streaming-services";

export async function getUserServiceIds(db: Database): Promise<number[]> {
  const rows = await db.query.userStreamingServices.findMany();
  return rows.map((r) => r.providerId);
}

export async function setUserServices(
  db: Database,
  providerIds: number[]
): Promise<void> {
  // Delete all existing
  await db.delete(schema.userStreamingServices);

  // Insert selected
  if (providerIds.length > 0) {
    const values = providerIds
      .map((id) => {
        const service = STREAMING_SERVICES.find((s) => s.id === id);
        if (!service) return null;
        return {
          providerId: service.id,
          providerName: service.name,
          logoPath: service.logoPath,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (values.length > 0) {
      await db.insert(schema.userStreamingServices).values(values);
    }
  }
}
