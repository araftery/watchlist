import { getWatchProviders, getTrailer } from "~/services/tmdb.server";
import type { Route } from "./+types/api.tmdb.details";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tmdbId = Number(url.searchParams.get("tmdbId"));
  const mediaType = url.searchParams.get("mediaType") as "movie" | "tv";

  if (!tmdbId || !mediaType) {
    return Response.json({ error: "Missing tmdbId or mediaType" }, { status: 400 });
  }

  const accessToken = context.cloudflare.env.TMDB_ACCESS_TOKEN;

  const [providers, trailer] = await Promise.all([
    getWatchProviders(accessToken, tmdbId, mediaType),
    getTrailer(accessToken, tmdbId, mediaType).catch(() => null),
  ]);

  return Response.json({ providers, trailer });
}
