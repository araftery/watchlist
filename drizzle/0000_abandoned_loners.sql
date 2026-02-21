CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watchlist_item_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`name` text,
	`overview` text,
	`air_date` text,
	`still_path` text,
	`watched` integer DEFAULT false NOT NULL,
	`watched_at` text,
	FOREIGN KEY (`watchlist_item_id`) REFERENCES `watchlist_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `genres` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`media_type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tv_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watchlist_item_id` integer NOT NULL,
	`current_season` integer DEFAULT 1 NOT NULL,
	`current_episode` integer DEFAULT 0 NOT NULL,
	`total_seasons` integer,
	`has_new_episodes` integer DEFAULT false,
	`next_episode_air_date` text,
	`show_status` text,
	`air_day_of_week` text,
	`last_checked_at` text,
	FOREIGN KEY (`watchlist_item_id`) REFERENCES `watchlist_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tv_progress_watchlist_item_id_unique` ON `tv_progress` (`watchlist_item_id`);--> statement-breakpoint
CREATE TABLE `watch_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watchlist_item_id` integer NOT NULL,
	`provider_type` text NOT NULL,
	`provider_name` text NOT NULL,
	`logo_path` text,
	`display_priority` integer,
	`region` text DEFAULT 'US' NOT NULL,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`watchlist_item_id`) REFERENCES `watchlist_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watchlist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`poster_path` text,
	`backdrop_path` text,
	`overview` text,
	`release_date` text,
	`vote_average` real,
	`genres` text,
	`status` text DEFAULT 'to_watch' NOT NULL,
	`vibe` text,
	`note` text,
	`added_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
