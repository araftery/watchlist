import { eq, and, asc } from "drizzle-orm";
import type { Database } from "~/db";
import { schema } from "~/db";
import { getSeasonDetails, getTVDetails } from "./tmdb.server";
import { isSeasonActive } from "~/lib/seasons";
import { getTodayNY } from "~/lib/utils";
export { parseWatchedSeasons, isSeasonActive } from "~/lib/seasons";

export async function initTVProgress(
  db: Database,
  watchlistItemId: number,
  tmdbId: number,
  accessToken: string,
  seasons?: number[]
) {
  const details = await getTVDetails(accessToken, tmdbId);

  const [progress] = await db
    .insert(schema.tvProgress)
    .values({
      watchlistItemId,
      currentSeason: 1,
      currentEpisode: 0,
      totalSeasons: details.number_of_seasons,
      showStatus: mapShowStatus(details.status),
      airDayOfWeek: computeAirDay(details),
      watchedSeasons: seasons ? JSON.stringify(seasons) : null,
      lastCheckedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.tvProgress.watchlistItemId,
      set: {
        totalSeasons: details.number_of_seasons,
        showStatus: mapShowStatus(details.status),
        airDayOfWeek: computeAirDay(details),
        watchedSeasons: seasons ? JSON.stringify(seasons) : null,
        lastCheckedAt: new Date().toISOString(),
      },
    })
    .returning();

  // Fetch episodes for all seasons (cache everything, filter on read)
  await fetchAndCacheEpisodes(db, watchlistItemId, tmdbId, details.number_of_seasons, accessToken);

  return progress;
}

async function fetchAndCacheEpisodes(
  db: Database,
  watchlistItemId: number,
  tmdbId: number,
  totalSeasons: number,
  accessToken: string
) {
  for (let s = 1; s <= totalSeasons; s++) {
    try {
      const season = await getSeasonDetails(accessToken, tmdbId, s);
      if (!season.episodes) continue;

      for (const ep of season.episodes) {
        await db
          .insert(schema.episodes)
          .values({
            watchlistItemId,
            seasonNumber: s,
            episodeNumber: ep.episode_number,
            name: ep.name,
            overview: ep.overview || null,
            airDate: ep.air_date || null,
            stillPath: ep.still_path || null,
            watched: false,
          })
          .onConflictDoNothing();
      }
    } catch {
      // Season may not be available yet
    }
  }
}

export async function getEpisodesForItem(
  db: Database,
  watchlistItemId: number,
  seasonNumber?: number
) {
  const conditions = [eq(schema.episodes.watchlistItemId, watchlistItemId)];
  if (seasonNumber !== undefined) {
    conditions.push(eq(schema.episodes.seasonNumber, seasonNumber));
  }

  return db.query.episodes.findMany({
    where: and(...conditions),
    orderBy: [
      asc(schema.episodes.seasonNumber),
      asc(schema.episodes.episodeNumber),
    ],
  });
}

export async function markEpisodeWatched(
  db: Database,
  episodeId: number,
  watched: boolean
) {
  return db
    .update(schema.episodes)
    .set({
      watched,
      watchedAt: watched ? new Date().toISOString() : null,
    })
    .where(eq(schema.episodes.id, episodeId))
    .returning();
}

export async function markEpisodesUpTo(
  db: Database,
  watchlistItemId: number,
  seasonNumber: number,
  episodeNumber: number
) {
  // Only mark episodes within the same season up to the target episode
  const allEpisodes = await getEpisodesForItem(db, watchlistItemId);
  const now = new Date().toISOString();

  for (const ep of allEpisodes) {
    const shouldBeWatched =
      ep.seasonNumber === seasonNumber && ep.episodeNumber <= episodeNumber;

    if (shouldBeWatched && !ep.watched) {
      await db
        .update(schema.episodes)
        .set({ watched: true, watchedAt: now })
        .where(eq(schema.episodes.id, ep.id));
    }
  }

  // Update progress
  await db
    .update(schema.tvProgress)
    .set({
      currentSeason: seasonNumber,
      currentEpisode: episodeNumber,
    })
    .where(eq(schema.tvProgress.watchlistItemId, watchlistItemId));
}

export async function getTVProgressForItem(
  db: Database,
  watchlistItemId: number
) {
  return db.query.tvProgress.findFirst({
    where: eq(schema.tvProgress.watchlistItemId, watchlistItemId),
  });
}

export async function getAllTVProgress(db: Database) {
  return db.query.tvProgress.findMany();
}

export async function computeNewEpisodeCount(
  db: Database,
  watchlistItemId: number,
  watchedSeasons?: number[] | null
): Promise<number> {
  const episodes = await getEpisodesForItem(db, watchlistItemId);
  const today = getTodayNY();

  return episodes.filter(
    (ep) =>
      !ep.watched &&
      ep.airDate &&
      ep.airDate <= today &&
      isSeasonActive(ep.seasonNumber, watchedSeasons ?? null)
  ).length;
}

export async function getNextUnwatchedEpisode(
  db: Database,
  watchlistItemId: number,
  watchedSeasons?: number[] | null
) {
  const episodes = await getEpisodesForItem(db, watchlistItemId);
  return episodes.find(
    (ep) =>
      !ep.watched &&
      isSeasonActive(ep.seasonNumber, watchedSeasons ?? null)
  );
}

export async function updateWatchedSeasons(
  db: Database,
  watchlistItemId: number,
  seasons: number[]
) {
  return db
    .update(schema.tvProgress)
    .set({ watchedSeasons: JSON.stringify(seasons) })
    .where(eq(schema.tvProgress.watchlistItemId, watchlistItemId));
}

function mapShowStatus(
  tmdbStatus: string
): "returning" | "ended" | "canceled" | "in_production" {
  switch (tmdbStatus) {
    case "Returning Series":
      return "returning";
    case "Ended":
      return "ended";
    case "Canceled":
      return "canceled";
    case "In Production":
    case "Planned":
      return "in_production";
    default:
      return "returning";
  }
}

function computeAirDay(details: any): string | null {
  // Try to get from next_episode_to_air or last_episode_to_air
  const ep = details.next_episode_to_air || details.last_episode_to_air;
  if (!ep?.air_date) return null;

  const date = new Date(ep.air_date);
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[date.getUTCDay()];
}
