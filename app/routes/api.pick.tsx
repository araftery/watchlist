import { getDb, schema } from "~/db";
import { eq, and } from "drizzle-orm";
import { pickForMe } from "~/services/gemini.server";
import type { Route } from "./+types/api.pick";

export async function action({ request, context }: Route.ActionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const apiKey = context.cloudflare.env.GEMINI_API_KEY;
  const formData = await request.formData();

  const vibe = formData.get("vibe") as "casual" | "engaged" | null;
  const mediaType = formData.get("type") as "movie" | "tv" | null;
  const genre = formData.get("genre") as string | null;

  // Get to_watch items with optional filters
  const conditions = [eq(schema.watchlistItems.status, "to_watch")];
  if (vibe) conditions.push(eq(schema.watchlistItems.vibe, vibe));
  if (mediaType)
    conditions.push(eq(schema.watchlistItems.mediaType, mediaType));

  let items = await db.query.watchlistItems.findMany({
    where: and(...conditions),
  });

  // Filter by genre if specified
  if (genre) {
    items = items.filter((item) => {
      try {
        const genres = JSON.parse(item.genres || "[]") as string[];
        return genres.some((g) => g.toLowerCase() === genre.toLowerCase());
      } catch {
        return false;
      }
    });
  }

  if (items.length === 0) {
    return Response.json(
      { error: "No items match your current filters" },
      { status: 404 }
    );
  }

  const result = await pickForMe(apiKey, items, {
    vibe: vibe || undefined,
    mediaType: mediaType || undefined,
    genre: genre || undefined,
  });

  if (!result) {
    return Response.json({ error: "Could not pick" }, { status: 500 });
  }

  const pickedItem = items.find((i) => i.id === result.itemId);

  return Response.json({
    itemId: result.itemId,
    reason: result.reason,
    title: pickedItem?.title || "",
    posterPath: pickedItem?.posterPath || null,
  });
}
