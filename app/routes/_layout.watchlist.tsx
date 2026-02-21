import { useLoaderData, useSearchParams, Link } from "react-router";
import { getDb, schema } from "~/db";
import { eq, and, desc } from "drizzle-orm";
import type { Route } from "./+types/_layout.watchlist";
import { PosterCard } from "~/components/poster-card";
import { List } from "lucide-react";
import { useLayoutContext } from "~/lib/layout-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const vibe = url.searchParams.get("vibe") as "casual" | "engaged" | null;
  const mediaType = url.searchParams.get("type") as "movie" | "tv" | null;
  const selectedGenres = url.searchParams.getAll("genre");

  const conditions = [];
  if (status) {
    conditions.push(eq(schema.watchlistItems.status, status as "to_watch" | "watching" | "watched" | "dropped"));
  }
  if (vibe) {
    conditions.push(eq(schema.watchlistItems.vibe, vibe));
  }
  if (mediaType) {
    conditions.push(eq(schema.watchlistItems.mediaType, mediaType));
  }

  let items = await db.query.watchlistItems.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: desc(schema.watchlistItems.createdAt),
  });

  // Collect genres for filter chips BEFORE genre filtering
  const allGenres = new Set<string>();
  items.forEach((item) => {
    try {
      const genres = JSON.parse(item.genres || "[]") as string[];
      genres.forEach((g) => allGenres.add(g));
    } catch {}
  });

  // Apply genre filter (OR — match ANY selected genre)
  if (selectedGenres.length > 0) {
    const lowerGenres = selectedGenres.map((g) => g.toLowerCase());
    items = items.filter((item) => {
      try {
        const genres = JSON.parse(item.genres || "[]") as string[];
        return genres.some((g) => lowerGenres.includes(g.toLowerCase()));
      } catch {
        return false;
      }
    });
  }

  // Get providers for each item
  const itemsWithProviders = await Promise.all(
    items.map(async (item) => {
      const providers = await db.query.watchProviders.findMany({
        where: and(
          eq(schema.watchProviders.watchlistItemId, item.id),
          eq(schema.watchProviders.providerType, "flatrate")
        ),
      });
      return { item, providers };
    })
  );

  // Count by status
  const allItems = await db.query.watchlistItems.findMany();
  const counts = {
    all: allItems.length,
    to_watch: allItems.filter((i) => i.status === "to_watch").length,
    watching: allItems.filter((i) => i.status === "watching").length,
    watched: allItems.filter((i) => i.status === "watched").length,
    dropped: allItems.filter((i) => i.status === "dropped").length,
  };

  return {
    items: itemsWithProviders,
    allGenres: Array.from(allGenres).sort(),
    counts,
    currentStatus: status,
    currentVibe: vibe,
    currentType: mediaType,
    selectedGenres,
  };
}

export default function WatchlistPage() {
  const {
    items,
    allGenres,
    counts,
    currentStatus,
    currentVibe,
    currentType,
    selectedGenres,
  } = useLoaderData<typeof loader>();
  const { userServiceIds } = useLayoutContext();
  const [searchParams, setSearchParams] = useSearchParams();

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        if (value) {
          prev.set(key, value);
        } else {
          prev.delete(key);
        }
        return prev;
      },
      { preventScrollReset: true }
    );
  }

  function toggleGenre(genre: string) {
    setSearchParams(
      (prev) => {
        const current = prev.getAll("genre");
        if (current.includes(genre)) {
          prev.delete("genre");
          current.filter((g) => g !== genre).forEach((g) => prev.append("genre", g));
        } else {
          prev.append("genre", genre);
        }
        return prev;
      },
      { preventScrollReset: true }
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Watchlist
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.all} title{counts.all !== 1 ? "s" : ""} in your collection
        </p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {[
          { value: null, label: "All", count: counts.all },
          { value: "to_watch", label: "To Watch", count: counts.to_watch },
          { value: "watching", label: "Watching", count: counts.watching },
          { value: "watched", label: "Watched", count: counts.watched },
          { value: "dropped", label: "Dropped", count: counts.dropped },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => setParam("status", opt.value)}
            className={`chip ${
              currentStatus === opt.value ? "chip-active" : "chip-inactive"
            }`}
          >
            {opt.label}
            {opt.count > 0 && (
              <span className="ml-1.5 opacity-60">{opt.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Vibe + Type filters */}
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          {[
            { value: "all", label: "All vibes" },
            { value: "casual", label: "Casual" },
            { value: "engaged", label: "Engaged" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                setParam("vibe", opt.value === "all" ? null : opt.value)
              }
              className={`chip ${
                (currentVibe || "all") === opt.value
                  ? "chip-active"
                  : "chip-inactive"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {[
            { value: "all", label: "All types" },
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV Shows" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                setParam("type", opt.value === "all" ? null : opt.value)
              }
              className={`chip ${
                (currentType || "all") === opt.value
                  ? "chip-active"
                  : "chip-inactive"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Genre chips */}
      {allGenres.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() =>
              setSearchParams(
                (prev) => {
                  prev.delete("genre");
                  return prev;
                },
                { preventScrollReset: true }
              )
            }
            className={`chip ${selectedGenres.length === 0 ? "chip-active" : "chip-inactive"}`}
          >
            All genres
          </button>
          {allGenres.map((genre) => (
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={`chip ${selectedGenres.includes(genre) ? "chip-active" : "chip-inactive"}`}
            >
              {genre}
            </button>
          ))}
        </div>
      )}

      {/* Items grid */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
            <List className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">No items match your filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link
                to="/search"
                className="font-medium text-primary hover:underline"
              >
                Search for something to add
              </Link>
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map(({ item, providers }) => (
            <PosterCard
              key={item.id}
              id={item.id}
              title={item.title}
              posterPath={item.posterPath}
              releaseDate={item.releaseDate}
              mediaType={item.mediaType}
              providers={providers}
              status={item.status}
              userServiceIds={userServiceIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
