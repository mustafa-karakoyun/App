// Bu dosya otomatik üretildi: npm run db:generate

export default {
  "journal": {
    "version": "7",
    "dialect": "sqlite",
    "entries": [
      {
        "idx": 0,
        "version": "6",
        "when": 1792788313778,
        "tag": "0000_init",
        "breakpoints": true
      },
      {
        "idx": 1,
        "version": "6",
        "when": 1793568241155,
        "tag": "0001_notes",
        "breakpoints": true
      }
    ]
  },
  "migrations": {
    "m0000": "CREATE TABLE `books` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`isbn13` text,\n\t`title` text NOT NULL,\n\t`authors` text DEFAULT '[]' NOT NULL,\n\t`publisher` text,\n\t`year` integer,\n\t`page_count` integer,\n\t`cover_url` text,\n\t`local_cover_uri` text,\n\t`source` text NOT NULL,\n\t`verified` integer DEFAULT false NOT NULL,\n\t`normalized_title` text NOT NULL,\n\t`normalized_authors` text DEFAULT '' NOT NULL,\n\t`sync_state` text DEFAULT 'synced' NOT NULL,\n\t`updated_at` text NOT NULL\n);\n--> statement-breakpoint\nCREATE INDEX `books_isbn` ON `books` (`isbn13`);--> statement-breakpoint\nCREATE INDEX `books_title` ON `books` (`normalized_title`);--> statement-breakpoint\nCREATE TABLE `kv` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `loans` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_book_id` text NOT NULL,\n\t`borrower_name` text NOT NULL,\n\t`lent_at` text NOT NULL,\n\t`due_at` text,\n\t`returned_at` text,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text,\n\t`notification_id` text\n);\n--> statement-breakpoint\nCREATE INDEX `loans_user_book` ON `loans` (`user_book_id`);--> statement-breakpoint\nCREATE TABLE `locations` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`parent_id` text,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text\n);\n--> statement-breakpoint\nCREATE TABLE `outbox` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`table_name` text NOT NULL,\n\t`record_id` text NOT NULL,\n\t`created_at` text NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `pending_scans` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`photo_uri` text NOT NULL,\n\t`status` text NOT NULL,\n\t`result` text,\n\t`error` text,\n\t`created_at` text NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `user_books` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`book_id` text NOT NULL,\n\t`status` text NOT NULL,\n\t`location_id` text,\n\t`added_via` text NOT NULL,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text\n);\n--> statement-breakpoint\nCREATE INDEX `user_books_book` ON `user_books` (`book_id`);--> statement-breakpoint\nCREATE INDEX `user_books_location` ON `user_books` (`location_id`);",
    "m0001": "CREATE TABLE `notes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_book_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`text` text NOT NULL,\n\t`page` integer,\n\t`created_at` text NOT NULL,\n\t`updated_at` text NOT NULL,\n\t`deleted_at` text\n);\n--> statement-breakpoint\nCREATE INDEX `notes_user_book` ON `notes` (`user_book_id`);"
  }
};
