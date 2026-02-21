import {
  useLoaderData,
  useSearchParams,
  Form,
} from "react-router";
import { getDb } from "~/db";
import {
  searchMulti,
  searchMovies,
  searchTVShows,
  getGenreList,
} from "~/services/tmdb.server";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import type { TMDBSearchResult } from "~/lib/types";
import type { Route } from "./+types/_layout.search";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { AddToWatchlistDialog } from "~/components/add-to-watchlist-dialog";
import { ItemDetailsDialog } from "~/components/item-details-dialog";
import { Search, Plus, Check, Star, SearchX } from "lucide-react";
import { useState, useEffect, useRef } from "react";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const type = url.searchParams.get("type") || "all";
  const accessToken = context.cloudflare.env.TMDB_ACCESS_TOKEN;
  const db = getDb(context.cloudflare.env.DB);

  // Fetch genre map for resolving IDs → names
  const genreLists = await getGenreList(accessToken);
  const genreMap: Record<number, string> = {};
  for (const g of genreLists.movie) genreMap[g.id] = g.name;
  for (const g of genreLists.tv) genreMap[g.id] = g.name;

  if (!query.trim()) {
    return { results: [], query, type, existingMap: {} as Record<string, number>, genreMap };
  }

  let results: TMDBSearchResult[];
  if (type === "movie") {
    const data = await searchMovies(accessToken, query);
    results = data.results;
  } else if (type === "tv") {
    const data = await searchTVShows(accessToken, query);
    results = data.results;
  } else {
    const data = await searchMulti(accessToken, query);
    results = data.results;
  }

  const existingItems = await db.query.watchlistItems.findMany();
  const existingMap: Record<string, number> = {};
  for (const item of existingItems) {
    existingMap[`${item.tmdbId}-${item.mediaType}`] = item.id;
  }

  return { results, query, type, existingMap, genreMap };
}

export default function SearchPage() {
  const { results, query, type, existingMap, genreMap } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [addingItem, setAddingItem] = useState<TMDBSearchResult | null>(null);
  const [detailsItem, setDetailsItem] = useState<TMDBSearchResult | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Search
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find movies and shows to add
        </p>
      </div>

      {/* Search form */}
      <Form method="get" className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            ref={inputRef}
            name="q"
            defaultValue={query}
            placeholder="Search movies & TV shows..."
            className="h-12 rounded-xl border-border/50 bg-card/60 pl-11 text-base backdrop-blur-sm placeholder:text-muted-foreground/40 focus-visible:ring-primary/30"
          />
        </div>
        <input type="hidden" name="type" value={type} />
        <Button type="submit" className="h-12 rounded-xl px-6">
          Search
        </Button>
      </Form>

      {/* Type toggle */}
      <div className="flex items-center gap-2">
        {[
          { value: "all", label: "All" },
          { value: "movie", label: "Movies" },
          { value: "tv", label: "TV Shows" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setSearchParams(
                (prev) => {
                  prev.set("type", opt.value);
                  return prev;
                },
                { preventScrollReset: true }
              );
            }}
            className={`chip ${type === opt.value ? "chip-active" : "chip-inactive"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {query && results.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
            <SearchX className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground">
            No results for "<span className="font-medium text-foreground">{query}</span>"
          </p>
        </div>
      )}

      <div className="space-y-3">
        {results.map((result) => {
          const key = `${result.id}-${result.mediaType}`;
          const watchlistItemId = existingMap[key];
          const isInWatchlist = watchlistItemId !== undefined;

          return (
            <button
              key={key}
              onClick={() => setDetailsItem(result)}
              className="flex w-full gap-4 rounded-xl border border-border/40 bg-card/40 p-4 text-left transition-colors hover:bg-card/70"
            >
              <img
                src={
                  getTMDBImageUrl(result.posterPath, "w154") ||
                  "/placeholder.svg"
                }
                alt={result.title}
                className="h-32 w-[84px] flex-none rounded-lg object-cover shadow-md"
              />
              <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-display font-semibold text-base">{result.title}</h3>
                  <Badge variant="secondary" className="flex-none text-[10px] uppercase tracking-wider">
                    {result.mediaType === "movie" ? "Film" : "Series"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {result.releaseDate && (
                    <span>{result.releaseDate.split("-")[0]}</span>
                  )}
                  {result.voteAverage > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-primary/80 text-primary/80" />
                      {result.voteAverage.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {result.overview}
                </p>
              </div>
              <div className="flex flex-none items-start pt-1">
                {isInWatchlist ? (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingItem(result);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setAddingItem(result);
                      }
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

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
