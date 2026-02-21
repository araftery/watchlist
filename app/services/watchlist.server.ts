import { eq, and, inArray, desc } from "drizzle-orm";
import type { Database } from "~/db";
import { schema } from "~/db";
import {
  getWatchProviders,
  type WatchProvider,
} from "./tmdb.server";

export type WatchlistItem = typeof schema.watchlistItems.$inferSelect;
export type NewWatchlistItem = typeof schema.watchlistItems.$inferInsert;
export type ItemStatus = "to_watch" | "watching" | "watched" | "dropped";
export type Vibe = "casual" | "engaged";

export async function addItem(
  db: Database,
  item: NewWatchlistItem,
  providers: WatchProvider[]
): Promise<WatchlistItem> {
  const [inserted] = await db
    .insert(schema.watchlistItems)
    .values(item)
    .returning();

  if (providers.length > 0) {
    // D1 has a 100 bind parameter limit; batch inserts to stay under it
    const rows = providers.map((p) => ({
      watchlistItemId: inserted.id,
      providerType: p.providerType,
      providerId: p.providerId,
      providerName: p.providerName,
      logoPath: p.logoPath,
      displayPriority: p.displayPriority,
    }));
    for (let i = 0; i < rows.length; i += 10) {
      await db.insert(schema.watchProviders).values(rows.slice(i, i + 10));
    }
  }

  return inserted;
}

export async function getItem(db: Database, id: number) {
  return db.query.watchlistItems.findFirst({
    where: eq(schema.watchlistItems.id, id),
  });
}

export async function getItemByTmdbId(
  db: Database,
  tmdbId: number,
  mediaType: "movie" | "tv"
) {
  return db.query.watchlistItems.findFirst({
    where: and(
      eq(schema.watchlistItems.tmdbId, tmdbId),
      eq(schema.watchlistItems.mediaType, mediaType)
    ),
  });
}

export async function getAllItems(
  db: Database,
  filters?: {
    status?: ItemStatus | ItemStatus[];
    vibe?: Vibe;
    mediaType?: "movie" | "tv";
  }
) {
  const conditions = [];

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(
        inArray(schema.watchlistItems.status, filters.status)
      );
    } else {
      conditions.push(eq(schema.watchlistItems.status, filters.status));
    }
  }

  if (filters?.vibe) {
    conditions.push(eq(schema.watchlistItems.vibe, filters.vibe));
  }

  if (filters?.mediaType) {
    conditions.push(eq(schema.watchlistItems.mediaType, filters.mediaType));
  }

  return db.query.watchlistItems.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(schema.watchlistItems.createdAt),
  });
}

export async function updateItemStatus(
  db: Database,
  id: number,
  status: ItemStatus
) {
  return db
    .update(schema.watchlistItems)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(schema.watchlistItems.id, id))
    .returning();
}

export async function updateItem(
  db: Database,
  id: number,
  updates: Partial<Pick<WatchlistItem, "vibe" | "note" | "status">>
) {
  return db
    .update(schema.watchlistItems)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(schema.watchlistItems.id, id))
    .returning();
}

export async function removeItem(db: Database, id: number) {
  return db
    .delete(schema.watchlistItems)
    .where(eq(schema.watchlistItems.id, id));
}

export async function getProvidersForItem(db: Database, itemId: number) {
  return db.query.watchProviders.findMany({
    where: eq(schema.watchProviders.watchlistItemId, itemId),
  });
}

export async function refreshProviders(
  db: Database,
  itemId: number,
  tmdbId: number,
  mediaType: "movie" | "tv",
  accessToken: string
) {
  const providers = await getWatchProviders(accessToken, tmdbId, mediaType);

  // Delete old providers
  await db
    .delete(schema.watchProviders)
    .where(eq(schema.watchProviders.watchlistItemId, itemId));

  // Insert fresh (batch to stay under D1's 100 bind param limit)
  if (providers.length > 0) {
    const rows = providers.map((p) => ({
      watchlistItemId: itemId,
      providerType: p.providerType,
      providerId: p.providerId,
      providerName: p.providerName,
      logoPath: p.logoPath,
      displayPriority: p.displayPriority,
    }));
    for (let i = 0; i < rows.length; i += 10) {
      await db.insert(schema.watchProviders).values(rows.slice(i, i + 10));
    }
  }

  return providers;
}
