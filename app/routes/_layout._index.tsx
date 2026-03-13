import { useState } from "react";
import { useLoaderData, useSearchParams, useFetcher, Link } from "react-router";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "~/db";
import type { Route } from "./+types/_layout._index";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Sparkles, Popcorn, Calendar } from "lucide-react";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import { PosterCard } from "~/components/poster-card";
import { ItemBrowserSheet } from "~/components/item-browser-sheet";
import { useLayoutContext } from "~/lib/layout-context";
import { parseWatchedSeasons, isSeasonActive } from "~/lib/seasons";
import { getTodayNY, getDateNY } from "~/lib/utils";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const url = new URL(request.url);
  const vibe = url.searchParams.get("vibe") as
    | "casual"
    | "engaged"
    | null;
  const mediaType = url.searchParams.get("type") as "movie" | "tv" | null;
  const genre = url.searchParams.get("genre");

  const today = getTodayNY();
  const nextWeek = getDateNY(7);

  // Get all watching items
  const watchingConditions = [
    eq(schema.watchlistItems.status, "watching"),
  ];
  if (vibe) watchingConditions.push(eq(schema.watchlistItems.vibe, vibe));

  const watchingItems = await db.query.watchlistItems.findMany({
    where: and(...watchingConditions),
  });

  // Enrich watching items with episodes, progress, providers
  const watchingWithDetails = await Promise.all(
    watchingItems.map(async (item) => {
      const progress = await db.query.tvProgress.findFirst({
        where: eq(schema.tvProgress.watchlistItemId, item.id),
      });
      const providers = await db.query.watchProviders.findMany({
        where: and(
          eq(schema.watchProviders.watchlistItemId, item.id),
          eq(schema.watchProviders.providerType, "flatrate")
        ),
      });
      const episodes = await db.query.episodes.findMany({
        where: eq(schema.episodes.watchlistItemId, item.id),
      });
      const activeSeasonsRaw = parseWatchedSeasons(progress?.watchedSeasons ?? null);
      const unwatchedAired = episodes.filter(
        (ep) =>
          !ep.watched &&
          ep.airDate &&
          ep.airDate <= today &&
          isSeasonActive(ep.seasonNumber, activeSeasonsRaw)
      );
      const nextUpcoming = episodes
        .filter(
          (ep) =>
            !ep.watched &&
            ep.airDate &&
            ep.airDate > today &&
            isSeasonActive(ep.seasonNumber, activeSeasonsRaw)
        )
        .sort((a, b) => (a.airDate || "").localeCompare(b.airDate || ""))[0];

      return {
        item,
        progress,
        providers,
        newEpisodeCount: unwatchedAired.length,
        nextUpcoming,
      };
    })
  );

  // Continue Watching: shows with unwatched aired episodes
  const continueWatching = watchingWithDetails.filter(
    (s) => s.newEpisodeCount > 0
  );

  // Airing Soon: shows with upcoming episodes in the next 7 days
  const airingSoon = watchingWithDetails
    .filter(
      (s) =>
        s.nextUpcoming?.airDate &&
        s.nextUpcoming.airDate <= nextWeek
    )
    .sort((a, b) =>
      (a.nextUpcoming!.airDate || "").localeCompare(
        b.nextUpcoming!.airDate || ""
      )
    );

  // Start something new: status = "to_watch"
  const newConditions = [
    eq(schema.watchlistItems.status, "to_watch"),
  ];
  if (vibe) newConditions.push(eq(schema.watchlistItems.vibe, vibe));
  if (mediaType) newConditions.push(eq(schema.watchlistItems.mediaType, mediaType));

  let newItems = await db.query.watchlistItems.findMany({
    where: and(...newConditions),
  });

  if (genre) {
    newItems = newItems.filter((item) => {
      try {
        const genres = JSON.parse(item.genres || "[]") as string[];
        return genres.some((g) => g.toLowerCase() === genre.toLowerCase());
      } catch {
        return false;
      }
    });
  }

  const newWithProviders = await Promise.all(
    newItems.map(async (item) => {
      const providers = await db.query.watchProviders.findMany({
        where: and(
          eq(schema.watchProviders.watchlistItemId, item.id),
          eq(schema.watchProviders.providerType, "flatrate")
        ),
      });
      return { item, providers };
    })
  );

  const allToWatchItems = await db.query.watchlistItems.findMany({
    where: eq(schema.watchlistItems.status, "to_watch"),
  });
  const allGenres = new Set<string>();
  allToWatchItems.forEach((item) => {
    try {
      const genres = JSON.parse(item.genres || "[]") as string[];
      genres.forEach((g) => allGenres.add(g));
    } catch {}
  });

  return {
    continueWatching,
    airingSoon,
    newItems: newWithProviders,
    allGenres: Array.from(allGenres).sort(),
    currentVibe: vibe,
    currentType: mediaType,
    currentGenre: genre,
  };
}

export default function HomePage() {
  const {
    continueWatching,
    airingSoon,
    newItems,
    allGenres,
    currentVibe,
    currentType,
    currentGenre,
  } = useLoaderData<typeof loader>();
  const { userServiceIds } = useLayoutContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const pickFetcher = useFetcher();
  const [browserIndex, setBrowserIndex] = useState<number | null>(null);

  const isPicking = pickFetcher.state !== "idle";
  const pickResult = pickFetcher.data as {
    itemId: number;
    reason: string;
    title: string;
    posterPath: string | null;
  } | null;

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

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            What to watch
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your personal screening room
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isPicking}
          className="gap-2 rounded-full border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => {
            const params = new URLSearchParams();
            if (currentVibe) params.set("vibe", currentVibe);
            if (currentType) params.set("type", currentType);
            if (currentGenre) params.set("genre", currentGenre);
            pickFetcher.submit(params, {
              method: "post",
              action: "/api/pick",
            });
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isPicking ? "Picking..." : "Pick for me"}
        </Button>
      </div>

      {/* Gemini Pick Result */}
      {pickResult && (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/8 via-primary/5 to-transparent p-5">
          <div className="flex gap-4">
            {pickResult.posterPath && (
              <img
                src={getTMDBImageUrl(pickResult.posterPath, "w154")!}
                alt={pickResult.title}
                className="h-24 w-16 rounded-lg object-cover shadow-lg"
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Tonight's pick
                </span>
              </div>
              <Link
                to={`/item/${pickResult.itemId}`}
                className="mt-1.5 block font-display text-xl font-bold hover:text-primary transition-colors"
              >
                {pickResult.title}
              </Link>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pickResult.reason}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Vibe Toggle */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 py-4 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="flex items-center gap-2">
          {[
            { value: "all", label: "All" },
            { value: "casual", label: "Casual" },
            { value: "engaged", label: "Engaged" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setParam("vibe", opt.value === "all" ? null : opt.value)}
              className={`chip ${
                (currentVibe || "all") === opt.value ? "chip-active" : "chip-inactive"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-xl font-bold tracking-tight">
            Continue watching
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:-mx-8 md:px-8 scrollbar-hide">
            {continueWatching.map(
              ({ item, progress, providers, newEpisodeCount }) => (
                <Link
                  key={item.id}
                  to={`/item/${item.id}`}
                  className="group flex-none"
                >
                  <div className="w-36 space-y-2">
                    <div className="poster-glow relative overflow-hidden rounded-xl">
                      <img
                        src={
                          getTMDBImageUrl(item.posterPath, "w185") ||
                          "/placeholder.svg"
                        }
                        alt={item.title}
                        className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.08]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      {newEpisodeCount > 0 && (
                        <Badge
                          className="absolute -right-0.5 -top-0.5 border-none bg-primary text-primary-foreground text-[10px] font-bold shadow-lg"
                        >
                          {newEpisodeCount} new
                        </Badge>
                      )}
                      {(() => {
                        const preferred = userServiceIds.length > 0
                          ? providers.find((p) => p.providerId != null && userServiceIds.includes(p.providerId)) || providers[0]
                          : providers[0];
                        return preferred?.logoPath ? (
                          <img
                            src={getTMDBImageUrl(preferred.logoPath, "w92")!}
                            alt={preferred.providerName}
                            className="absolute bottom-2 right-2 h-7 w-7 rounded-md shadow-lg ring-1 ring-black/20"
                          />
                        ) : null;
                      })()}
                      {/* Progress indicator */}
                      {progress && (
                        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
                          <p className="text-[11px] font-semibold text-white drop-shadow">
                            S{progress.currentSeason} E{progress.currentEpisode}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                      {item.title}
                    </p>
                  </div>
                </Link>
              )
            )}
          </div>
        </section>
      )}

      {/* Airing Soon */}
      {airingSoon.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-xl font-bold tracking-tight">
            Airing soon
          </h2>
          <div className="space-y-2">
            {airingSoon.map(({ item, nextUpcoming, providers }) => (
              <Link
                key={item.id}
                to={`/item/${item.id}`}
                className="group flex items-center gap-4 rounded-xl border border-border/40 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70"
              >
                {item.posterPath && (
                  <img
                    src={getTMDBImageUrl(item.posterPath, "w92")!}
                    alt=""
                    className="h-14 w-9 flex-none rounded-lg object-cover shadow-md"
                  />
                )}
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-display font-semibold group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  {nextUpcoming && (
                    <p className="text-xs text-muted-foreground">
                      S{nextUpcoming.seasonNumber} E{nextUpcoming.episodeNumber}
                      {nextUpcoming.name && ` — ${nextUpcoming.name}`}
                    </p>
                  )}
                </div>
                {nextUpcoming?.airDate && (
                  <div className="flex flex-none items-center gap-1.5 text-sm font-medium text-primary">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatAirDate(nextUpcoming.airDate)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Start Something New */}
      <section>
        <h2 className="mb-4 font-display text-xl font-bold tracking-tight">
          Start something new
        </h2>

        {/* Sub-filters */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2">
            {[
              { value: "all", label: "All" },
              { value: "movie", label: "Movies" },
              { value: "tv", label: "TV Shows" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setParam("type", opt.value === "all" ? null : opt.value)}
                className={`chip ${
                  (currentType || "all") === opt.value ? "chip-active" : "chip-inactive"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {allGenres.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setParam("genre", null)}
                className={`chip ${!currentGenre ? "chip-active" : "chip-inactive"}`}
              >
                All genres
              </button>
              {allGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() =>
                    setParam("genre", currentGenre === genre ? null : genre)
                  }
                  className={`chip ${currentGenre === genre ? "chip-active" : "chip-inactive"}`}
                >
                  {genre}
                </button>
              ))}
            </div>
          )}
        </div>

        {newItems.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
              <Popcorn className="h-8 w-8 text-primary/60" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold">Nothing here yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link
                  to="/search"
                  className="font-medium text-primary hover:underline"
                >
                  Search for something to add
                </Link>{" "}
                to your watchlist
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {newItems.map(({ item, providers }, index) => (
              <PosterCard
                key={item.id}
                id={item.id}
                title={item.title}
                posterPath={item.posterPath}
                releaseDate={item.releaseDate}
                mediaType={item.mediaType}
                providers={providers}
                userServiceIds={userServiceIds}
                onClick={() => setBrowserIndex(index)}
              />
            ))}
          </div>
        )}
      </section>

      <ItemBrowserSheet
        items={newItems}
        selectedIndex={browserIndex}
        onClose={() => setBrowserIndex(null)}
        onNavigate={setBrowserIndex}
        userServiceIds={userServiceIds}
      />
    </div>
  );
}

function formatAirDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
