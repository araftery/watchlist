CREATE TABLE `user_streaming_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` integer NOT NULL,
	`provider_name` text NOT NULL,
	`logo_path` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_streaming_services_provider_id_unique` ON `user_streaming_services` (`provider_id`);--> statement-breakpoint
ALTER TABLE `watch_providers` ADD `provider_id` integer;