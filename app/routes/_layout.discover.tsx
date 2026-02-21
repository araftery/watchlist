import { useLoaderData, useSearchParams } from "react-router";
import { getDb } from "~/db";
import {
  getTrending,
  discoverMovies,
  discoverTVShows,
  getNowPlayingMovies,
  getOnTheAirTVShows,
  getGenreList,
  getWatchProviders,
} from "~/services/tmdb.server";
import { VIBE_GENRE_IDS } from "~/lib/vibe";
import type { TMDBSearchResult, WatchProvider } from "~/lib/types";
import type { Route } from "./+types/_layout.discover";
import { PosterCard } from "~/components/poster-card";
import { AddToWatchlistDialog } from "~/components/add-to-watchlist-dialog";
import { ItemDetailsDialog } from "~/components/item-details-dialog";
import { useLayoutContext } from "~/lib/layout-context";
import { Plus, Check } from "lucide-react";
import { useState } from "react";

type Category = "trending" | "top_rated" | "now_playing" | "new_rentals";
type MediaType = "movie" | "tv";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "top_rated", label: "Top Rated" },
  { value: "now_playing", label: "Now Playing" },
  { value: "new_rentals", label: "New Rentals" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const category = (url.searchParams.get("category") || "trending") as Category;
  const type = (url.searchParams.get("type") || "movie") as MediaType;
  const genreParam = url.searchParams.get("genre");
  const vibeParam = url.searchParams.get("vibe") as "casual" | "engaged" | null;

  const accessToken = context.cloudflare.env.TMDB_ACCESS_TOKEN;
  const db = getDb(context.cloudflare.env.DB);

  // Fetch genre list and existing watchlist items in parallel
  const [genreLists, existingItems] = await Promise.all([
    getGenreList(accessToken),
    db.query.watchlistItems.findMany(),
  ]);

  const genreMap: Record<number, string> = {};
  for (const g of genreLists.movie) genreMap[g.id] = g.name;
  for (const g of genreLists.tv) genreMap[g.id] = g.name;

  const existingMap: Record<string, number> = {};
  for (const item of existingItems) {
    existingMap[`${item.tmdbId}-${item.mediaType}`] = item.id;
  }

  // Determine genre filter (pipe = OR in TMDB API, comma = AND)
  const withGenres = vibeParam
    ? VIBE_GENRE_IDS[vibeParam][type].join("|")
    : genreParam || undefined;

  // Fetch results based on category
  let data: { results: TMDBSearchResult[]; totalPages: number };

  if (category === "trending") {
    if (withGenres) {
      // Trending with filter → use discover sorted by popularity
      const discoverFn = type === "movie" ? discoverMovies : discoverTVShows;
      data = await discoverFn(accessToken, {
        sort_by: "popularity.desc",
        with_genres: withGenres,
      });
    } else {
      data = await getTrending(accessToken, type, "week");
    }
  } else if (category === "top_rated") {
    const discoverFn = type === "movie" ? discoverMovies : discoverTVShows;
    data = await discoverFn(accessToken, {
      sort_by: "vote_average.desc",
      "vote_count.gte": 200,
      ...(withGenres ? { with_genres: withGenres } : {}),
    });
  } else if (category === "now_playing") {
    if (withGenres) {
      // Now playing with filter → use discover with date range
      const today = new Date().toISOString().split("T")[0];
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      if (type === "movie") {
        data = await discoverMovies(accessToken, {
          sort_by: "popularity.desc",
          "primary_release_date.gte": monthAgo,
          "primary_release_date.lte": today,
          with_genres: withGenres,
        });
      } else {
        data = await discoverTVShows(accessToken, {
          sort_by: "popularity.desc",
          "air_date.gte": monthAgo,
          "air_date.lte": today,
          with_genres: withGenres,
        });
      }
    } else {
      if (type === "movie") {
        data = await getNowPlayingMovies(accessToken);
      } else {
        data = await getOnTheAirTVShows(accessToken);
      }
    }
  } else {
    // new_rentals — movies only
    data = await discoverMovies(accessToken, {
      with_watch_monetization_types: "rent",
      watch_region: "US",
      sort_by: "release_date.desc",
      ...(withGenres ? { with_genres: withGenres } : {}),
    });
  }

  // Fetch watch providers for each result in parallel
  const resultsWithProviders = await Promise.all(
    data.results.map(async (result) => {
      try {
        const providers = await getWatchProviders(
          accessToken,
          result.id,
          result.mediaType
        );
        // Only keep flatrate (streaming) providers
        const flatrate = providers.filter((p) => p.providerType === "flatrate");
        return { result, providers: flatrate };
      } catch {
        return { result, providers: [] as WatchProvider[] };
      }
    })
  );

  const genres = type === "movie" ? genreLists.movie : genreLists.tv;

  return {
    resultsWithProviders,
    category,
    type,
    genre: genreParam,
    vibe: vibeParam,
    genres,
    genreMap,
    existingMap,
  };
}

export default function DiscoverPage() {
  const {
    resultsWithProviders,
    category,
    type,
    genre,
    vibe,
    genres,
    genreMap,
    existingMap,
  } = useLoaderData<typeof loader>();
  const { userServiceIds } = useLayoutContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addingItem, setAddingItem] = useState<TMDBSearchResult | null>(null);
  const [detailsItem, setDetailsItem] = useState<TMDBSearchResult | null>(null);

  function setParam(key: string, value: string | null, clear?: string[]) {
    setSearchParams(
      (prev) => {
        if (value) {
          prev.set(key, value);
        } else {
          prev.delete(key);
        }
        if (clear) {
          for (const k of clear) prev.delete(k);
        }
        return prev;
      },
      { preventScrollReset: true }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Discover
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse trending and new content
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => {
              const params: Record<string, string> = { category: cat.value };
              // Force movie type for new_rentals
              if (cat.value === "new_rentals") {
                params.type = "movie";
              } else if (type) {
                params.type = type;
              }
              // Preserve genre/vibe unless switching to new_rentals clears type=tv
              if (genre) params.genre = genre;
              if (vibe) params.vibe = vibe;
              setSearchParams(params, { preventScrollReset: true });
            }}
            className={`chip ${category === cat.value ? "chip-active" : "chip-inactive"}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Type toggle */}
      <div className="flex items-center gap-2">
        {(["movie", "tv"] as const).map((t) => (
          <button
            key={t}
            disabled={category === "new_rentals" && t === "tv"}
            onClick={() => setParam("type", t)}
            className={`chip ${type === t ? "chip-active" : "chip-inactive"} ${
              category === "new_rentals" && t === "tv"
                ? "cursor-not-allowed opacity-40"
                : ""
            }`}
          >
            {t === "movie" ? "Movies" : "TV Shows"}
          </button>
        ))}
      </div>

      {/* Vibe + Genre chips */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Vibe
          </span>
          {(["casual", "engaged"] as const).map((v) => (
            <button
              key={v}
              onClick={() =>
                setParam("vibe", vibe === v ? null : v, ["genre"])
              }
              className={`chip ${vibe === v ? "chip-active" : "chip-inactive"}`}
            >
              {v === "casual" ? "Casual" : "Engaged"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          <span className="flex-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Genre
          </span>
          {genres.map((g) => (
            <button
              key={g.id}
              onClick={() =>
                setParam(
                  "genre",
                  genre === String(g.id) ? null : String(g.id),
                  ["vibe"]
                )
              }
              className={`chip flex-none ${
                genre === String(g.id) ? "chip-active" : "chip-inactive"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results grid */}
      {resultsWithProviders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">
            No results found. Try adjusting your filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {resultsWithProviders.map(({ result, providers }) => {
            const key = `${result.id}-${result.mediaType}`;
            const watchlistItemId = existingMap[key];
            const isInWatchlist = watchlistItemId !== undefined;

            return (
              <PosterCard
                key={key}
                id={isInWatchlist ? watchlistItemId : result.id}
                title={result.title}
                posterPath={result.posterPath}
                releaseDate={result.releaseDate}
                mediaType={result.mediaType}
                providers={providers}
                userServiceIds={userServiceIds}
                onClick={() => setDetailsItem(result)}
                overlay={
                  <div className="absolute left-2 top-2">
                    {isInWatchlist ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 backdrop-blur-sm">
                        <Check className="h-4 w-4 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100">
                        <Plus className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      <ItemDetailsDialog
        item={detailsItem}
        genreMap={genreMap}
        watchlistItemId={detailsItem ? existingMap[`${detailsItem.id}-${detailsItem.mediaType}`] : undefined}
        onClose={() => setDetailsItem(null)}
        onAddToWatchlist={(item) => {
          setDetailsItem(null);
          setAddingItem(item);
        }}
      />

      <AddToWatchlistDialog
        item={addingItem}
        genreMap={genreMap}
        onClose={() => setAddingItem(null)}
      />
    </div>
  );
}
