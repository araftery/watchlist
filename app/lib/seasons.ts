/**
 * Parse the watched_seasons JSON column into a number array.
 * Returns null if raw is null (meaning all seasons are active).
 */
export function parseWatchedSeasons(raw: string | null): number[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as number[];
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a season is active given a watched seasons list.
 * null = all seasons active (backward compat).
 */
export function isSeasonActive(
  seasonNumber: number,
  watchedSeasons: number[] | null
): boolean {
  if (watchedSeasons === null) return true;
  return watchedSeasons.includes(seasonNumber);
}
