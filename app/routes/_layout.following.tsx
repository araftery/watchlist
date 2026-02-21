import { useLoaderData, useFetcher, Link } from "react-router";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "~/db";
import type { Route } from "./+types/_layout.following";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getTMDBImageUrl } from "~/lib/tmdb-image";
import { Check, Calendar, Tv, Clock } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useLayoutContext } from "~/lib/layout-context";

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env.DB);

  // Get all watching TV shows
  const watchingShows = await db.query.watchlistItems.findMany({
    where: and(
      eq(schema.watchlistItems.status, "watching"),
      eq(schema.watchlistItems.mediaType, "tv")
    ),
  });

  const showsWithDetails = await Promise.all(
    watchingShows.map(async (show) => {
      const progress = await db.query.tvProgress.findFirst({
        where: eq(schema.tvProgress.watchlistItemId, show.id),
      });

      const episodes = await db.query.episodes.findMany({
        where: eq(schema.episodes.watchlistItemId, show.id),
      });

      const providers = await db.query.watchProviders.findMany({
        where: and(
          eq(schema.watchProviders.watchlistItemId, show.id),
          eq(schema.watchProviders.providerType, "flatrate")
        ),
      });

      const today = new Date().toISOString().split("T")[0];
      const airedEpisodes = episodes.filter(
        (ep) => ep.airDate && ep.airDate <= today
      );
      const unwatchedAired = airedEpisodes.filter((ep) => !ep.watched);
      const totalWatched = episodes.filter((ep) => ep.watched).length;

      // Find next unwatched episode
      const nextUnwatched = episodes
        .filter((ep) => !ep.watched)
        .sort(
          (a, b) =>
            a.seasonNumber - b.seasonNumber ||
            a.episodeNumber - b.episodeNumber
        )[0];

      // Find next upcoming episode (future air date)
      const nextUpcoming = episodes
        .filter((ep) => !ep.watched && ep.airDate && ep.airDate > today)
        .sort((a, b) => (a.airDate || "").localeCompare(b.airDate || ""))[0];

      return {
        show,
        progress,
        providers,
        episodeCount: airedEpisodes.length,
        totalEpisodes: episodes.length,
        totalWatched,
        newEpisodeCount: unwatchedAired.length,
        nextUnwatched,
        nextUpcoming,
      };
    })
  );

  // Filter out shows with nothing actionable (fully caught up + no upcoming)
  const activeShows = showsWithDetails.filter(
    (s) => s.newEpisodeCount > 0 || s.nextUpcoming
  );

  // Sort: shows with unwatched episodes first, then by next air date
  activeShows.sort((a, b) => {
    if (a.newEpisodeCount > 0 && b.newEpisodeCount === 0) return -1;
    if (b.newEpisodeCount > 0 && a.newEpisodeCount === 0) return 1;
    const aDate = a.nextUpcoming?.airDate || "9999";
    const bDate = b.nextUpcoming?.airDate || "9999";
    return aDate.localeCompare(bDate);
  });

  // Build schedule view
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const schedule = days.map((day) => ({
    day,
    shows: showsWithDetails.filter(
      (s) =>
        s.progress?.airDayOfWeek === day &&
        s.progress?.showStatus === "returning" &&
        s.nextUpcoming !== undefined
    ),
  }));

  return { shows: activeShows, schedule };
}

export async function action({ request, context }: Route.ActionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "markWatched") {
    const episodeId = Number(formData.get("episodeId"));
    const watchlistItemId = Number(formData.get("watchlistItemId"));

    await db
      .update(schema.episodes)
      .set({ watched: true, watchedAt: new Date().toISOString() })
      .where(eq(schema.episodes.id, episodeId));

    // Update progress
    const episode = await db.query.episodes.findFirst({
      where: eq(schema.episodes.id, episodeId),
    });
    if (episode) {
      await db
        .update(schema.tvProgress)
        .set({
          currentSeason: episode.seasonNumber,
          currentEpisode: episode.episodeNumber,
        })
        .where(eq(schema.tvProgress.watchlistItemId, watchlistItemId));
    }

    return { success: true };
  }

  return { error: "Unknown action" };
}

function pickPreferredProvider(
  providers: Array<{ logoPath: string | null; providerName: string; providerId: number | null }>,
  userServiceIds: number[]
) {
  if (userServiceIds.length > 0) {
    const preferred = providers.find(
      (p) => p.providerId != null && userServiceIds.includes(p.providerId)
    );
    if (preferred) return preferred;
  }
  return providers[0] || null;
}

export default function FollowingPage() {
  const { shows, schedule } = useLoaderData<typeof loader>();
  const { userServiceIds } = useLayoutContext();
  const fetcher = useFetcher();
  const [view, setView] = useState<"shows" | "schedule">("shows");

  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).success) {
      toast.success("Episode marked as watched");
    }
  }, [fetcher.data]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Following
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your currently-airing shows
        </p>
      </div>

      {shows.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
            <Tv className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">No shows tracked yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Set a TV show's status to "Watching" to start tracking episodes
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* View toggle */}
          <div className="flex items-center gap-2">
            {(
              [
                { value: "shows", label: "Shows" },
                { value: "schedule", label: "Schedule" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setView(opt.value)}
                className={`chip ${view === opt.value ? "chip-active" : "chip-inactive"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {view === "shows" && (
            <div className="space-y-3">
              {shows.map(
                ({
                  show,
                  progress,
                  providers,
                  episodeCount,
                  totalWatched,
                  newEpisodeCount,
                  nextUnwatched,
                  nextUpcoming,
                }) => (
                  <div
                    key={show.id}
                    className="flex gap-4 rounded-xl border border-border/40 bg-card/40 p-4 transition-colors hover:bg-card/70"
                  >
                    <Link to={`/item/${show.id}`} className="group flex-none">
                      <div className="poster-glow relative overflow-hidden rounded-lg">
                        <img
                          src={
                            getTMDBImageUrl(show.posterPath, "w154") ||
                            "/placeholder.svg"
                          }
                          alt={show.title}
                          className="h-28 w-[74px] object-cover transition-transform duration-500 group-hover:scale-[1.08]"
                          loading="lazy"
                        />
                        {(() => {
                          const preferred = pickPreferredProvider(providers, userServiceIds);
                          return preferred?.logoPath ? (
                            <img
                              src={getTMDBImageUrl(preferred.logoPath, "w92")!}
                              alt={preferred.providerName}
                              className="absolute bottom-1 right-1 h-5 w-5 rounded shadow-lg ring-1 ring-black/20"
                            />
                          ) : null;
                        })()}
                      </div>
                    </Link>
                    <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
                      <Link
                        to={`/item/${show.id}`}
                        className="truncate font-display font-semibold text-base hover:text-primary transition-colors"
                      >
                        {show.title}
                      </Link>

                      {/* Progress text */}
                      {progress && (
                        <p className="text-xs text-muted-foreground">
                          On S{progress.currentSeason} E
                          {progress.currentEpisode}
                        </p>
                      )}

                      {/* Progress bar */}
                      {episodeCount > 0 && (
                        <div className="h-1.5 w-full max-w-48 rounded-full bg-muted/50">
                          <div
                            className="progress-glow h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${(totalWatched / episodeCount) * 100}%`,
                            }}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {newEpisodeCount > 0 && (
                          <Badge className="border-none bg-primary text-primary-foreground text-[10px] font-bold shadow-lg">
                            {newEpisodeCount} new
                          </Badge>
                        )}
                        {nextUpcoming && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatNextDate(nextUpcoming.airDate)}
                          </span>
                        )}
                        {progress?.showStatus === "ended" && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-wider"
                          >
                            Ended
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Quick mark watched */}
                    {nextUnwatched && (
                      <div className="flex flex-none items-center">
                        <fetcher.Form method="post">
                          <input
                            type="hidden"
                            name="intent"
                            value="markWatched"
                          />
                          <input
                            type="hidden"
                            name="episodeId"
                            value={nextUnwatched.id}
                          />
                          <input
                            type="hidden"
                            name="watchlistItemId"
                            value={show.id}
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-full border-border/50 text-xs hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                            disabled={fetcher.state !== "idle"}
                          >
                            <Check className="h-3 w-3" />
                            <span className="hidden sm:inline">
                              S{nextUnwatched.seasonNumber}E
                              {nextUnwatched.episodeNumber}
                            </span>
                          </Button>
                        </fetcher.Form>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {view === "schedule" && (
            <div className="space-y-5">
              {schedule.map(({ day, shows: dayShows }) => (
                <div key={day}>
                  <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {day}
                  </h3>
                  {dayShows.length === 0 ? (
                    <p className="text-sm text-muted-foreground/40 italic">
                      Nothing airs
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dayShows.map(({ show }) => (
                        <Link
                          key={show.id}
                          to={`/item/${show.id}`}
                          className="group flex items-center gap-2.5 rounded-xl border border-border/40 bg-card/40 px-3.5 py-2.5 text-sm transition-all hover:border-primary/30 hover:bg-card/70"
                        >
                          {show.posterPath && (
                            <img
                              src={getTMDBImageUrl(show.posterPath, "w92")!}
                              alt=""
                              className="h-8 w-5 rounded object-cover"
                            />
                          )}
                          <span className="font-medium group-hover:text-primary transition-colors">
                            {show.title}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatNextDate(dateStr: string | null): string {
  if (!dateStr) return "";
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
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
