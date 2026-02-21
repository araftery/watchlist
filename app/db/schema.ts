import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const watchlistItems = sqliteTable("watchlist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type", { enum: ["movie", "tv"] }).notNull(),
  title: text("title").notNull(),
  posterPath: text("poster_path"),
  backdropPath: text("backdrop_path"),
  overview: text("overview"),
  releaseDate: text("release_date"),
  voteAverage: real("vote_average"),
  genres: text("genres"), // JSON string array e.g. '["Drama","Thriller"]'
  status: text("status", {
    enum: ["to_watch", "watching", "watched", "dropped"],
  })
    .notNull()
    .default("to_watch"),
  vibe: text("vibe", { enum: ["casual", "engaged"] }),
  note: text("note"),
  addedBy: text("added_by"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const watchProviders = sqliteTable("watch_providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  watchlistItemId: integer("watchlist_item_id")
    .notNull()
    .references(() => watchlistItems.id, { onDelete: "cascade" }),
  providerType: text("provider_type", {
    enum: ["flatrate", "rent", "buy"],
  }).notNull(),
  providerId: integer("provider_id"),
  providerName: text("provider_name").notNull(),
  logoPath: text("logo_path"),
  displayPriority: integer("display_priority"),
  region: text("region").notNull().default("US"),
  fetchedAt: text("fetched_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const userStreamingServices = sqliteTable("user_streaming_services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  providerId: integer("provider_id").notNull().unique(),
  providerName: text("provider_name").notNull(),
  logoPath: text("logo_path"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const tvProgress = sqliteTable("tv_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  watchlistItemId: integer("watchlist_item_id")
    .notNull()
    .unique()
    .references(() => watchlistItems.id, { onDelete: "cascade" }),
  currentSeason: integer("current_season").notNull().default(1),
  currentEpisode: integer("current_episode").notNull().default(0),
  totalSeasons: integer("total_seasons"),
  hasNewEpisodes: integer("has_new_episodes", { mode: "boolean" }).default(
    false
  ),
  nextEpisodeAirDate: text("next_episode_air_date"),
  showStatus: text("show_status", {
    enum: ["returning", "ended", "canceled", "in_production"],
  }),
  airDayOfWeek: text("air_day_of_week"),
  lastCheckedAt: text("last_checked_at"),
});

export const episodes = sqliteTable("episodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  watchlistItemId: integer("watchlist_item_id")
    .notNull()
    .references(() => watchlistItems.id, { onDelete: "cascade" }),
  seasonNumber: integer("season_number").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  name: text("name"),
  overview: text("overview"),
  airDate: text("air_date"),
  stillPath: text("still_path"),
  watched: integer("watched", { mode: "boolean" }).notNull().default(false),
  watchedAt: text("watched_at"),
});

export const genres = sqliteTable("genres", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  mediaType: text("media_type", { enum: ["movie", "tv"] }).notNull(),
});
