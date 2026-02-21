import { getDb } from "~/db";
import { getWatchProviders } from "~/services/tmdb.server";
import { addItem, getItemByTmdbId } from "~/services/watchlist.server";
import { initTVProgress } from "~/services/episodes.server";
import type { Route } from "./+types/api.watchlist.add";

export async function action({ request, context }: Route.ActionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const accessToken = context.cloudflare.env.TMDB_ACCESS_TOKEN;
  const formData = await request.formData();

  const tmdbId = Number(formData.get("tmdbId"));
  const mediaType = formData.get("mediaType") as "movie" | "tv";
  const title = formData.get("title") as string;
  const posterPath = formData.get("posterPath") as string | null;
  const backdropPath = formData.get("backdropPath") as string | null;
  const overview = formData.get("overview") as string;
  const releaseDate = formData.get("releaseDate") as string;
  const voteAverage = Number(formData.get("voteAverage") || 0);
  const genres = formData.get("genres") as string;
  const vibe = formData.get("vibe") as "casual" | "engaged" | null;
  const status =
    (formData.get("status") as "to_watch" | "watching") || "to_watch";
  const note = (formData.get("note") as string) || null;

  const existing = await getItemByTmdbId(db, tmdbId, mediaType);
  if (existing) {
    return { error: "Already in your watchlist", item: existing };
  }

  const providers = await getWatchProviders(accessToken, tmdbId, mediaType);

  const item = await addItem(
    db,
    {
      tmdbId,
      mediaType,
      title,
      posterPath,
      backdropPath,
      overview,
      releaseDate,
      voteAverage,
      genres,
      vibe,
      status,
      note,
    },
    providers
  );

  if (status === "watching" && mediaType === "tv") {
    await initTVProgress(db, item.id, tmdbId, accessToken);
  }

  return { success: true, item };
}
