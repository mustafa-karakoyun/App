CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`isbn13` text,
	`title` text NOT NULL,
	`authors` text DEFAULT '[]' NOT NULL,
	`publisher` text,
	`year` integer,
	`page_count` integer,
	`cover_url` text,
	`local_cover_uri` text,
	`source` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`normalized_title` text NOT NULL,
	`normalized_authors` text DEFAULT '' NOT NULL,
	`sync_state` text DEFAULT 'synced' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `books_isbn` ON `books` (`isbn13`);--> statement-breakpoint
CREATE INDEX `books_title` ON `books` (`normalized_title`);--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_book_id` text NOT NULL,
	`borrower_name` text NOT NULL,
	`lent_at` text NOT NULL,
	`due_at` text,
	`returned_at` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`notification_id` text
);
--> statement-breakpoint
CREATE INDEX `loans_user_book` ON `loans` (`user_book_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_uri` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_books` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`status` text NOT NULL,
	`location_id` text,
	`added_via` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `user_books_book` ON `user_books` (`book_id`);--> statement-breakpoint
CREATE INDEX `user_books_location` ON `user_books` (`location_id`);