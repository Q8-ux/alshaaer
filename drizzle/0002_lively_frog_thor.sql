CREATE TABLE `integration_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `integration_settings_updated_at_idx` ON `integration_settings` (`updated_at`);