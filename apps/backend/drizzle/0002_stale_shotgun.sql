CREATE TABLE `push_campaigns` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(128) NOT NULL,
	`body` varchar(512) NOT NULL,
	`language` varchar(8),
	`segment` varchar(24) NOT NULL DEFAULT 'all',
	`country` varchar(8),
	`status` varchar(16) NOT NULL DEFAULT 'draft',
	`recipient_count` int NOT NULL DEFAULT 0,
	`sent_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`sent_at` timestamp,
	CONSTRAINT `push_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `push_campaigns_status_idx` ON `push_campaigns` (`status`);