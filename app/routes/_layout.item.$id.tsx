import { useLoaderData, useFetcher, Link, redirect, Await } from "react-router";
import { eq, and, asc } from "drizzle-orm";
import { getDb, schema } from "~/db";
import type { Route } from "./+types/_layout.item.$id";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import { initTVProgress, updateWatchedSeasons } from "~/services/episodes.server";
import { parseWatchedSeasons } from "~/lib/seasons";
import { refreshProviders } from "~/services/watchlist.server";
import { getUserServiceIds } from "~/services/settings.server";
import { getTrailer, getTVDetails } from "~/services/tmdb.server";
import type { TMDBSeasonSummary } from "~/lib/types";
import { TrailerButton } from "~/components/trailer-button";
import { ArrowLeft, Star, Check, Trash2, Eye, EyeOff } from "lucide-react";
import { Suspense, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const accessToken = context.cloudflare.env.TMDB_ACCESS_TOKEN;
  const id = Number(params.id);

  const item = await db.query.watchlistItems.findFirst({
    where: eq(schema.watchlistItems.id, id),
  });

  if (!item) {
    throw new Response("Not found", { status: 404 });
  }

  let providers = await db.query.watchProviders.findMany({
    where: eq(schema.watchProviders.watchlistItemId, id),
  });

  // Lazy backfill: if any provider is missing providerId, re-fetch from TMDB
  const needsBackfill = providers.some((p) => p.providerId == null);
  if (needsBackfill && providers.length > 0) {
    await refreshProviders(db, id, item.tmdbId, item.mediaType, accessToken);
    providers = await db.query.watchProviders.findMany({
      where: eq(schema.watchProviders.watchlistItemId, id),
    });
  }

  const progress = await db.query.tvProgress.findFirst({
    where: eq(schema.tvProgress.watchlistItemId, id),
  });

  const episodes = await db.query.episodes.findMany({
    where: eq(schema.episodes.watchlistItemId, id),
    orderBy: [
      asc(schema.episodes.seasonNumber),
      asc(schema.episodes.episodeNumber),
    ],
  });

  // Group episodes by season
  const seasons = new Map<
    number,
    (typeof episodes)[number][]
  >();
  for (const ep of episodes) {
    const list = seasons.get(ep.seasonNumber) || [];
    list.push(ep);
    seasons.set(ep.seasonNumber, list);
  }

  const [userServiceIds, trailer] = await Promise.all([
    getUserServiceIds(db),
    getTrailer(accessToken, item.tmdbId, item.mediaType).catch(() => null),
  ]);

  const flatrate = providers.filter((p) => p.providerType === "flatrate");
  const rent = providers.filter((p) => p.providerType === "rent");
  const buy = providers.filter((p) => p.providerType === "buy");

  // Split flatrate into user's services vs others
  const userServiceSet = new Set(userServiceIds);
  const yourServices = flatrate.filter(
    (p) => p.providerId != null && userServiceSet.has(p.providerId)
  );
  const otherServices = flatrate.filter(
    (p) => p.providerId == null || !userServiceSet.has(p.providerId)
  );

  // For TV shows without cached episodes, fetch season summary from TMDB (streamed)
  const tmdbSeasonsPromise =
    item.mediaType === "tv" && episodes.length === 0
      ? getTVDetails(accessToken, item.tmdbId).then((details) =>
          ((details as any).seasons as any[])
            .filter((s: any) => s.season_number > 0)
            .map(
              (s: any): TMDBSeasonSummary => ({
                id: s.id,
                name: s.name,
                seasonNumber: s.season_number,
                episodeCount: s.episode_count,
                airDate: s.air_date || null,
                posterPath: s.poster_path || null,
                overview: s.overview || "",
              })
            )
        )
      : null;

  const activeSeasons = progress
    ? parseWatchedSeasons(progress.watchedSeasons)
    : null;

  return {
    item,
    yourServices,
    otherServices,
    rent,
    buy,
    progress,
    seasons: Object.fromEntries(seasons),
    seasonNumbers: Array.from(seasons.keys()).sort((a, b) => a - b),
    trailer,
    hasUserServices: userServiceIds.length > 0,
    tmdbSeasonsPromise,
    activeSeasons,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const accessToken = context.cloudflare.env.TMDB_ACCESS_TOKEN;
  const id = Number(params.id);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateStatus") {
    const status = formData.get("status") as "to_watch" | "watching" | "watched" | "dropped";
    await db
      .update(schema.watchlistItems)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(schema.watchlistItems.id, id));

    // If changing to "watching" for a TV show, DON'T auto-init progress here.
    // The user will pick seasons via the season picker, which calls startWatchingWithSeasons.
    // But if progress already exists (e.g. re-setting to watching from dropped), keep it.
    if (status === "watching") {
      const item = await db.query.watchlistItems.findFirst({
        where: eq(schema.watchlistItems.id, id),
      });
      if (item?.mediaType === "tv") {
        const existingProgress = await db.query.tvProgress.findFirst({
          where: eq(schema.tvProgress.watchlistItemId, id),
        });
        if (existingProgress) {
          // Progress already exists, no need to re-init
          return { success: true };
        }
        // No progress yet — return a flag so the UI shows the season picker
        return { success: true, needsSeasonPicker: true };
      }
    }

    return { success: true };
  }

  if (intent === "startWatchingWithSeasons") {
    const seasonsRaw = formData.get("seasons") as string;
    const seasons = JSON.parse(seasonsRaw) as number[];

    // Set status to watching
    await db
      .update(schema.watchlistItems)
      .set({ status: "watching", updatedAt: new Date().toISOString() })
      .where(eq(schema.watchlistItems.id, id));

    const item = await db.query.watchlistItems.findFirst({
      where: eq(schema.watchlistItems.id, id),
    });
    if (item) {
      await initTVProgress(db, id, item.tmdbId, accessToken, seasons);
    }

    return { success: true };
  }

  if (intent === "toggleSeason") {
    const seasonNumber = Number(formData.get("seasonNumber"));
    const progress = await db.query.tvProgress.findFirst({
      where: eq(schema.tvProgress.watchlistItemId, id),
    });
    if (!progress) return { error: "No progress found" };

    const current = parseWatchedSeasons(progress.watchedSeasons);
    let updated: number[];

    if (current === null) {
      // Currently all seasons active — toggling one off means all-except-this-one
      const allSeasons = Array.from(
        { length: progress.totalSeasons || 1 },
        (_, i) => i + 1
      );
      updated = allSeasons.filter((s) => s !== seasonNumber);
    } else if (current.includes(seasonNumber)) {
      // Remove this season
      updated = current.filter((s) => s !== seasonNumber);
    } else {
      // Add this season
      updated = [...current, seasonNumber].sort((a, b) => a - b);
    }

    await updateWatchedSeasons(db, id, updated);
    return { success: true };
  }

  if (intent === "updateVibe") {
    const vibe = (formData.get("vibe") as "casual" | "engaged" | "") || null;
    await db
      .update(schema.watchlistItems)
      .set({ vibe: vibe || null, updatedAt: new Date().toISOString() })
      .where(eq(schema.watchlistItems.id, id));
    return { success: true };
  }

  if (intent === "updateNote") {
    const note = formData.get("note") as string;
    await db
      .update(schema.watchlistItems)
      .set({ note: note || null, updatedAt: new Date().toISOString() })
      .where(eq(schema.watchlistItems.id, id));
    return { success: true };
  }

  if (intent === "markEpisode") {
    const episodeId = Number(formData.get("episodeId"));
    const watched = formData.get("watched") === "true";
    await db
      .update(schema.episodes)
      .set({
        watched,
        watchedAt: watched ? new Date().toISOString() : null,
      })
      .where(eq(schema.episodes.id, episodeId));

    // Update progress if marking watched
    if (watched) {
      const ep = await db.query.episodes.findFirst({
        where: eq(schema.episodes.id, episodeId),
      });
      if (ep) {
        await db
          .update(schema.tvProgress)
          .set({
            currentSeason: ep.seasonNumber,
            currentEpisode: ep.episodeNumber,
          })
          .where(eq(schema.tvProgress.watchlistItemId, id));
      }
    }
    return { success: true };
  }

  if (intent === "markUpTo") {
    const seasonNumber = Number(formData.get("seasonNumber"));
    const episodeNumber = Number(formData.get("episodeNumber"));
    const now = new Date().toISOString();

    // Only mark episodes within the same season up to the target episode
    const allEpisodes = await db.query.episodes.findMany({
      where: eq(schema.episodes.watchlistItemId, id),
    });

    for (const ep of allEpisodes) {
      const shouldWatch =
        ep.seasonNumber === seasonNumber &&
        ep.episodeNumber <= episodeNumber;

      if (shouldWatch && !ep.watched) {
        await db
          .update(schema.episodes)
          .set({ watched: true, watchedAt: now })
          .where(eq(schema.episodes.id, ep.id));
      }
    }

    await db
      .update(schema.tvProgress)
      .set({
        currentSeason: seasonNumber,
        currentEpisode: episodeNumber,
      })
      .where(eq(schema.tvProgress.watchlistItemId, id));

    return { success: true };
  }

  if (intent === "delete") {
    await db
      .delete(schema.watchlistItems)
      .where(eq(schema.watchlistItems.id, id));
    return redirect("/watchlist");
  }

  return { error: "Unknown action" };
}

export default function ItemDetailPage() {
  const { item, yourServices, otherServices, rent, buy, progress, seasons, seasonNumbers, trailer, hasUserServices, tmdbSeasonsPromise, activeSeasons } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [selectedSeason, setSelectedSeason] = useState(
    seasonNumbers[0] || 1
  );
  const [noteValue, setNoteValue] = useState(item.note || "");
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [pickerSeasons, setPickerSeasons] = useState<number[]>([]);

  const genres: string[] = (() => {
    try {
      return JSON.parse(item.genres || "[]");
    } catch {
      return [];
    }
  })();

  const currentEpisodes = seasons[selectedSeason] || [];

  const hasAnyProvider = yourServices.length > 0 || otherServices.length > 0 || rent.length > 0 || buy.length > 0;

  // Check if a season is active (for eye toggle display)
  function isActive(seasonNum: number): boolean {
    if (activeSeasons === null) return true;
    return activeSeasons.includes(seasonNum);
  }

  // Handle status button click — intercept "watching" for TV shows without progress
  function handleStatusClick(status: string) {
    if (status === "watching" && item.mediaType === "tv" && !progress) {
      // Show season picker instead of immediately setting status
      setShowSeasonPicker(true);
      return;
    }
    fetcher.submit(
      { intent: "updateStatus", status },
      { method: "post" }
    );
  }

  // Confirm season picker selection
  function confirmSeasonPicker() {
    if (pickerSeasons.length === 0) return;
    fetcher.submit(
      {
        intent: "startWatchingWithSeasons",
        seasons: JSON.stringify(pickerSeasons),
      },
      { method: "post" }
    );
    setShowSeasonPicker(false);
  }

  return (
    <div className="space-y-8">
      {/* Back button */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      {/* Header with backdrop */}
      {item.backdropPath && (
        <div className="relative -mx-4 -mt-4 h-52 overflow-hidden md:rounded-2xl md:mx-0 md:h-64">
          <img
            src={getTMDBImageUrl(item.backdropPath, "w780")!}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      )}

      <div className="flex gap-5">
        {item.posterPath && (
          <img
            src={getTMDBImageUrl(item.posterPath, "w342")!}
            alt={item.title}
            className={`w-28 rounded-xl object-cover shadow-xl ring-1 ring-white/5 md:w-36 ${
              item.backdropPath ? "-mt-24 relative md:-mt-32" : ""
            }`}
          />
        )}
        <div className={`flex-1 space-y-2.5 ${item.backdropPath ? "-mt-2" : ""}`}>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            {item.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              {item.mediaType === "movie" ? "Film" : "Series"}
            </Badge>
            {item.releaseDate && (
              <span>{item.releaseDate.split("-")[0]}</span>
            )}
            {item.voteAverage ? (
              <span className="flex items-center gap-0.5">
                <Star className="h-3.5 w-3.5 fill-primary/80 text-primary/80" />
                {item.voteAverage.toFixed(1)}
              </span>
            ) : null}
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.map((genre) => (
                <Badge
                  key={genre}
                  variant="outline"
                  className="border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  {genre}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overview */}
      {item.overview && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.overview}
        </p>
      )}

      {/* Trailer */}
      {trailer && <TrailerButton trailer={trailer} />}

      {/* Where to watch */}
      {hasAnyProvider && (
        <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Where to watch
          </h2>

          {/* User's streaming services */}
          {yourServices.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-primary/70 font-semibold">
                {hasUserServices ? "On your services" : "Stream"}
              </p>
              <div className="flex flex-wrap gap-2">
                {yourServices.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2"
                  >
                    {p.logoPath && (
                      <img
                        src={getTMDBImageUrl(p.logoPath, "w92")!}
                        alt=""
                        className="h-6 w-6 rounded-md"
                      />
                    )}
                    <span className="text-xs font-medium">{p.providerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other streaming services */}
          {otherServices.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/60">
                {yourServices.length > 0 ? "Also available on" : "Stream"}
              </p>
              <div className="flex flex-wrap gap-2">
                {otherServices.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 rounded-xl border border-border/40 bg-background/30 px-3 py-2 ${
                      hasUserServices && yourServices.length > 0 ? "opacity-50" : ""
                    }`}
                  >
                    {p.logoPath && (
                      <img
                        src={getTMDBImageUrl(p.logoPath, "w92")!}
                        alt=""
                        className="h-6 w-6 rounded-md"
                      />
                    )}
                    <span className="text-xs font-medium">{p.providerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rent.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/60">
                Rent
              </p>
              <div className="flex flex-wrap gap-2">
                {rent.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/30 px-3 py-2"
                  >
                    {p.logoPath && (
                      <img
                        src={getTMDBImageUrl(p.logoPath, "w92")!}
                        alt=""
                        className="h-6 w-6 rounded-md"
                      />
                    )}
                    <span className="text-xs font-medium">{p.providerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {buy.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground/60">
                Buy
              </p>
              <div className="flex flex-wrap gap-2">
                {buy.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/30 px-3 py-2"
                  >
                    {p.logoPath && (
                      <img
                        src={getTMDBImageUrl(p.logoPath, "w92")!}
                        alt=""
                        className="h-6 w-6 rounded-md"
                      />
                    )}
                    <span className="text-xs font-medium">{p.providerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Status */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "to_watch", label: "To Watch" },
              { value: "watching", label: "Watching" },
              { value: "watched", label: "Watched" },
              { value: "dropped", label: "Dropped" },
            ] as const
          ).map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusClick(s.value)}
              className={`chip ${item.status === s.value ? "chip-active" : "chip-inactive"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* Season Picker (for TV shows being set to "watching") */}
      {showSeasonPicker && (
        <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              Pick seasons to watch
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select which seasons you want to track. You can change this later.
            </p>
          </div>

          {tmdbSeasonsPromise ? (
            <Suspense
              fallback={
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-xl" />
                  ))}
                </div>
              }
            >
              <Await resolve={tmdbSeasonsPromise}>
                {(tmdbSeasons) => (
                  <SeasonPickerGrid
                    seasons={tmdbSeasons as TMDBSeasonSummary[]}
                    selected={pickerSeasons}
                    onToggle={(num) => {
                      setPickerSeasons((prev) =>
                        prev.includes(num)
                          ? prev.filter((s) => s !== num)
                          : [...prev, num].sort((a, b) => a - b)
                      );
                    }}
                    onSelectAll={() => {
                      const allNums = (tmdbSeasons as TMDBSeasonSummary[]).map((s) => s.seasonNumber);
                      setPickerSeasons(allNums);
                    }}
                  />
                )}
              </Await>
            </Suspense>
          ) : (
            // Fallback: if we already have episodes cached, show season numbers from those
            <div className="flex flex-wrap gap-2">
              {seasonNumbers.map((num) => (
                <button
                  key={num}
                  onClick={() =>
                    setPickerSeasons((prev) =>
                      prev.includes(num)
                        ? prev.filter((s) => s !== num)
                        : [...prev, num].sort((a, b) => a - b)
                    )
                  }
                  className={`chip ${
                    pickerSeasons.includes(num) ? "chip-active" : "chip-inactive"
                  }`}
                >
                  Season {num}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={confirmSeasonPicker}
              disabled={pickerSeasons.length === 0}
              size="sm"
              className="rounded-xl"
            >
              Start watching ({pickerSeasons.length} season{pickerSeasons.length !== 1 ? "s" : ""})
            </Button>
            <Button
              onClick={() => setShowSeasonPicker(false)}
              variant="ghost"
              size="sm"
              className="rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </section>
      )}

      {/* Vibe */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vibe
        </h2>
        <div className="flex gap-2">
          {(["casual", "engaged"] as const).map((v) => (
            <button
              key={v}
              onClick={() =>
                fetcher.submit(
                  { intent: "updateVibe", vibe: item.vibe === v ? "" : v },
                  { method: "post" }
                )
              }
              className={`chip ${item.vibe === v ? "chip-active" : "chip-inactive"}`}
            >
              {v === "casual" ? "Casual" : "Engaged"}
            </button>
          ))}
        </div>
      </section>

      {/* Note */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Note
        </h2>
        <fetcher.Form method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="updateNote" />
          <Input
            name="note"
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            placeholder="e.g. Sarah recommended this"
            className="flex-1 rounded-xl border-border/50 bg-card/60 placeholder:text-muted-foreground/40"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-xl border-border/50 hover:border-primary/50 hover:text-primary"
          >
            Save
          </Button>
        </fetcher.Form>
      </section>

      {/* Episodes (TV only) */}
      {item.mediaType === "tv" &&
        seasonNumbers.length > 0 && (
          <section className="space-y-5">
            <h2 className="font-display text-xl font-bold tracking-tight">
              Episodes
            </h2>

            {/* Season selector with eye toggle */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {seasonNumbers.map((s) => (
                <div key={s} className="flex items-center gap-0.5 flex-none">
                  <button
                    onClick={() => setSelectedSeason(s)}
                    className={`chip ${
                      selectedSeason === s ? "chip-active" : "chip-inactive"
                    } ${!isActive(s) ? "opacity-40" : ""}`}
                  >
                    Season {s}
                  </button>
                  {progress && (
                    <button
                      onClick={() =>
                        fetcher.submit(
                          { intent: "toggleSeason", seasonNumber: String(s) },
                          { method: "post" }
                        )
                      }
                      className={`p-1 rounded-md transition-colors ${
                        isActive(s)
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted-foreground/40 hover:bg-muted/20"
                      }`}
                      title={isActive(s) ? "Stop tracking this season" : "Start tracking this season"}
                    >
                      {isActive(s) ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Episode list */}
            <div className="space-y-1">
              {currentEpisodes.map((ep) => (
                <div
                  key={ep.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-card/40 ${
                    ep.watched ? "opacity-50" : ""
                  }`}
                >
                  <fetcher.Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="markEpisode"
                    />
                    <input
                      type="hidden"
                      name="episodeId"
                      value={ep.id}
                    />
                    <input
                      type="hidden"
                      name="watched"
                      value={ep.watched ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                        ep.watched
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 hover:border-primary/50 hover:bg-primary/10"
                      }`}
                    >
                      {ep.watched && <Check className="h-3 w-3" />}
                    </button>
                  </fetcher.Form>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">
                        E{ep.episodeNumber}
                      </span>
                      {ep.name && (
                        <span className="truncate text-sm">
                          {ep.name}
                        </span>
                      )}
                    </div>
                    {ep.airDate && (
                      <p className="text-[11px] text-muted-foreground/60">
                        {new Date(ep.airDate + "T00:00:00").toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </p>
                    )}
                  </div>
                  {!ep.watched && (
                    <fetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="markUpTo"
                      />
                      <input
                        type="hidden"
                        name="seasonNumber"
                        value={ep.seasonNumber}
                      />
                      <input
                        type="hidden"
                        name="episodeNumber"
                        value={ep.episodeNumber}
                      />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="text-[11px] text-muted-foreground hover:text-primary"
                      >
                        Watch up to here
                      </Button>
                    </fetcher.Form>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      {/* Season overview (TV shows without cached episodes) */}
      {tmdbSeasonsPromise && !showSeasonPicker && (
        <section className="space-y-5">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Seasons
          </h2>
          <Suspense
            fallback={
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            }
          >
            <Await resolve={tmdbSeasonsPromise}>
              {(tmdbSeasons) => (
                <div className="space-y-2">
                  {(tmdbSeasons as TMDBSeasonSummary[]).map((season) => (
                    <div
                      key={season.id}
                      className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/30 px-4 py-3"
                    >
                      {season.posterPath && (
                        <img
                          src={getTMDBImageUrl(season.posterPath, "w92")!}
                          alt=""
                          className="h-14 w-10 rounded-lg object-cover ring-1 ring-white/5"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {season.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60">
                          {season.episodeCount} episode{season.episodeCount !== 1 ? "s" : ""}
                          {season.airDate && (
                            <span>
                              {" "}&middot;{" "}
                              {new Date(season.airDate + "T00:00:00").toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Await>
          </Suspense>
        </section>
      )}

      {/* Delete */}
      <div className="pt-4">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            className="gap-1.5 text-xs text-muted-foreground/50 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            Remove from watchlist
          </Button>
        </fetcher.Form>
      </div>
    </div>
  );
}

function SeasonPickerGrid({
  seasons,
  selected,
  onToggle,
  onSelectAll,
}: {
  seasons: TMDBSeasonSummary[];
  selected: number[];
  onToggle: (num: number) => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onSelectAll}
        className="text-xs font-medium text-primary hover:underline"
      >
        Select all
      </button>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {seasons.map((season) => (
          <button
            key={season.id}
            onClick={() => onToggle(season.seasonNumber)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
              selected.includes(season.seasonNumber)
                ? "border-primary/50 bg-primary/10"
                : "border-border/40 bg-card/30 hover:border-border/60"
            }`}
          >
            {season.posterPath && (
              <img
                src={getTMDBImageUrl(season.posterPath, "w92")!}
                alt=""
                className="h-10 w-7 rounded object-cover ring-1 ring-white/5"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{season.name}</p>
              <p className="text-[10px] text-muted-foreground/60">
                {season.episodeCount} ep{season.episodeCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                selected.includes(season.seasonNumber)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60"
              }`}
            >
              {selected.includes(season.seasonNumber) && (
                <Check className="h-3 w-3" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
