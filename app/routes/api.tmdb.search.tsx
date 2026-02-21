import {
  searchMulti,
  searchMovies,
  searchTVShows,
} from "~/services/tmdb.server";
import type { Route } from "./+types/api.tmdb.search";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const type = url.searchParams.get("type") || "all";
  const page = Number(url.searchParams.get("page") || "1");

  if (!query) {
    return Response.json({ results: [], totalPages: 0 });
  }

  const accessToken = context.cloudflare.env.TMDB_ACCESS_TOKEN;

  let data;
  if (type === "movie") {
    data = await searchMovies(accessToken, query, page);
  } else if (type === "tv") {
    data = await searchTVShows(accessToken, query, page);
  } else {
    data = await searchMulti(accessToken, query, page);
  }

  return Response.json(data);
}
