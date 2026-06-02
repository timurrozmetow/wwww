CREATE TABLE `ad_providers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`provider_key` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`priority` int NOT NULL DEFAULT 100,
	`ecpm_estimate` double NOT NULL DEFAULT 0,
	`fill_rate` double NOT NULL DEFAULT 0,
	`ad_unit_id` varchar(128) NOT NULL,
	`timeout_ms` int NOT NULL DEFAULT 5000,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ad_providers_id` PRIMARY KEY(`id`),
	CONSTRAINT `ad_providers_key_uq` UNIQUE(`provider_key`)
);
