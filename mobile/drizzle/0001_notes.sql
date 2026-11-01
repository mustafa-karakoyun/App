CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_book_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`page` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `notes_user_book` ON `notes` (`user_book_id`);