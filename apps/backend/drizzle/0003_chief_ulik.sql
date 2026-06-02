CREATE TABLE `fraud_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_id` varchar(36) NOT NULL,
	`event_type` varchar(48) NOT NULL,
	`severity` int NOT NULL DEFAULT 0,
	`source` varchar(24) NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fraud_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `fraud_events_device_idx` ON `fraud_events` (`device_id`);--> statement-breakpoint
CREATE INDEX `fraud_events_created_idx` ON `fraud_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `fraud_events_type_idx` ON `fraud_events` (`event_type`);