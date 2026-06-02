CREATE TABLE `ad_sessions` (
	`id` varchar(36) NOT NULL,
	`device_id` varchar(36) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'admob',
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`reward_minutes` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`rewarded_at` timestamp,
	CONSTRAINT `ad_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_audit_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`admin_id` bigint NOT NULL,
	`action` varchar(64) NOT NULL,
	`target_type` varchar(32),
	`target_id` varchar(64),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admins` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'admin',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_login_at` timestamp,
	CONSTRAINT `admins_id` PRIMARY KEY(`id`),
	CONSTRAINT `admins_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` varchar(36) NOT NULL,
	`install_id` varchar(64) NOT NULL,
	`app_version` varchar(32) NOT NULL,
	`platform` varchar(16) NOT NULL DEFAULT 'android',
	`language` varchar(8) NOT NULL,
	`country` varchar(8),
	`timezone` varchar(64),
	`device_integrity_status` varchar(32),
	`fraud_score` int NOT NULL DEFAULT 0,
	`is_blocked` boolean NOT NULL DEFAULT false,
	`balance_minutes_cache` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_install_id_uq` UNIQUE(`install_id`)
);
--> statement-breakpoint
CREATE TABLE `emergency_access_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_id` varchar(36) NOT NULL,
	`granted` boolean NOT NULL,
	`minutes` int NOT NULL DEFAULT 0,
	`reason` varchar(32) NOT NULL,
	`failed_networks` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emergency_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `in_app_banners` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`title` varchar(128) NOT NULL,
	`body` varchar(512) NOT NULL,
	`image_url` varchar(512),
	`deeplink` varchar(255),
	`language` varchar(8),
	`segment` varchar(24) NOT NULL DEFAULT 'all',
	`starts_at` timestamp,
	`ends_at` timestamp,
	`priority` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `in_app_banners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minute_ledger` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_id` varchar(36) NOT NULL,
	`entry_type` varchar(32) NOT NULL,
	`minutes` int NOT NULL,
	`reference_id` varchar(128),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp,
	CONSTRAINT `minute_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_reference_uq` UNIQUE(`reference_id`)
);
--> statement-breakpoint
CREATE TABLE `push_tokens` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`device_id` varchar(36) NOT NULL,
	`token` varchar(255) NOT NULL,
	`platform` varchar(16) NOT NULL DEFAULT 'android',
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_tokens_token_uq` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `remote_config` (
	`config_key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`value_type` varchar(16) NOT NULL DEFAULT 'string',
	`description` varchar(255),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updated_by` varchar(64),
	CONSTRAINT `remote_config_config_key` PRIMARY KEY(`config_key`)
);
--> statement-breakpoint
CREATE TABLE `reward_transactions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`transaction_id` varchar(128) NOT NULL,
	`device_id` varchar(36) NOT NULL,
	`session_id` varchar(36),
	`source` varchar(32) NOT NULL,
	`minutes` int NOT NULL,
	`raw_callback` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reward_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `reward_tx_transaction_uq` UNIQUE(`transaction_id`)
);
--> statement-breakpoint
CREATE TABLE `vpn_providers` (
	`id` varchar(36) NOT NULL,
	`name` varchar(64) NOT NULL,
	`type` varchar(24) NOT NULL DEFAULT 'subscription',
	`subscription_secret` varchar(512),
	`priority` int NOT NULL DEFAULT 100,
	`enabled` boolean NOT NULL DEFAULT true,
	`last_sync_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vpn_providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vpn_servers` (
	`id` varchar(36) NOT NULL,
	`provider_id` varchar(36) NOT NULL,
	`country` varchar(8) NOT NULL,
	`city` varchar(64),
	`name` varchar(64) NOT NULL,
	`host` varchar(255),
	`config_blob` text,
	`ping_ms` int NOT NULL DEFAULT 0,
	`load_percent` int NOT NULL DEFAULT 0,
	`status` varchar(16) NOT NULL DEFAULT 'online',
	`recent_failures` int NOT NULL DEFAULT 0,
	`priority` int NOT NULL DEFAULT 100,
	`country_priority` int NOT NULL DEFAULT 100,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vpn_servers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vpn_sessions` (
	`id` varchar(36) NOT NULL,
	`device_id` varchar(36) NOT NULL,
	`active_device_id` varchar(36),
	`server_id` varchar(36) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`token` varchar(64) NOT NULL,
	`allotted_minutes` int NOT NULL,
	`minutes_debited` int NOT NULL DEFAULT 0,
	`bytes_in` bigint NOT NULL DEFAULT 0,
	`bytes_out` bigint NOT NULL DEFAULT 0,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`deadline` timestamp NOT NULL,
	`ended_at` timestamp,
	`disconnect_reason` varchar(32),
	CONSTRAINT `vpn_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `vpn_sessions_active_device_uq` UNIQUE(`active_device_id`)
);
--> statement-breakpoint
CREATE INDEX `ad_sessions_device_created_idx` ON `ad_sessions` (`device_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ad_sessions_status_idx` ON `ad_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `admin_audit_admin_idx` ON `admin_audit_logs` (`admin_id`);--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `devices_country_idx` ON `devices` (`country`);--> statement-breakpoint
CREATE INDEX `devices_language_idx` ON `devices` (`language`);--> statement-breakpoint
CREATE INDEX `devices_last_seen_idx` ON `devices` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `devices_is_blocked_idx` ON `devices` (`is_blocked`);--> statement-breakpoint
CREATE INDEX `emergency_logs_device_created_idx` ON `emergency_access_logs` (`device_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `emergency_logs_created_idx` ON `emergency_access_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `banners_enabled_idx` ON `in_app_banners` (`enabled`);--> statement-breakpoint
CREATE INDEX `banners_language_idx` ON `in_app_banners` (`language`);--> statement-breakpoint
CREATE INDEX `ledger_device_created_idx` ON `minute_ledger` (`device_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `push_tokens_device_idx` ON `push_tokens` (`device_id`);--> statement-breakpoint
CREATE INDEX `reward_tx_device_idx` ON `reward_transactions` (`device_id`);--> statement-breakpoint
CREATE INDEX `vpn_servers_provider_idx` ON `vpn_servers` (`provider_id`);--> statement-breakpoint
CREATE INDEX `vpn_servers_enabled_status_idx` ON `vpn_servers` (`enabled`,`status`);--> statement-breakpoint
CREATE INDEX `vpn_servers_country_idx` ON `vpn_servers` (`country`);--> statement-breakpoint
CREATE INDEX `vpn_sessions_device_status_idx` ON `vpn_sessions` (`device_id`,`status`);--> statement-breakpoint
CREATE INDEX `vpn_sessions_status_idx` ON `vpn_sessions` (`status`);