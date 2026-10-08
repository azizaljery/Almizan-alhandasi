CREATE TABLE `archive_design_versions` (
	`design_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`project_snapshot_json` text NOT NULL,
	`exact_model_json` text NOT NULL,
	`novelty_geometry_json` text NOT NULL,
	`exact_geometry_hash` text,
	`topology_json` text NOT NULL,
	`decision_trace_json` text NOT NULL,
	`novelty_hash` text NOT NULL,
	`geometry_policy_version` text NOT NULL,
	`engine_version` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`design_id`, `version_number`),
	FOREIGN KEY (`design_id`,`owner_user_id`) REFERENCES `archive_designs`(`id`,`owner_user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_archive_versions_version_number" CHECK("archive_design_versions"."version_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE `archive_designs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`current_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ck_archive_designs_current_version" CHECK("archive_designs"."current_version" >= 1),
	CONSTRAINT "ck_archive_designs_title_length" CHECK(length("archive_designs"."title") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_archive_designs_id_owner` ON `archive_designs` (`id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_archive_designs_owner_updated` ON `archive_designs` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `archive_geometry_claims` (
	`novelty_hash` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`design_id` text,
	`created_at` integer NOT NULL,
	`tombstoned_at` integer,
	CONSTRAINT "ck_archive_claim_tombstone_state" CHECK(("archive_geometry_claims"."owner_user_id" IS NOT NULL AND "archive_geometry_claims"."design_id" IS NOT NULL AND "archive_geometry_claims"."tombstoned_at" IS NULL) OR ("archive_geometry_claims"."owner_user_id" IS NULL AND "archive_geometry_claims"."design_id" IS NULL AND "archive_geometry_claims"."tombstoned_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_archive_claims_owner_design` ON `archive_geometry_claims` (`owner_user_id`,`design_id`);--> statement-breakpoint
CREATE TABLE `archive_idempotency` (
	`owner_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation` text NOT NULL,
	`target_design_id` text NOT NULL,
	`expected_version` integer NOT NULL,
	`request_hash` text NOT NULL,
	`design_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_user_id`, `idempotency_key`),
	FOREIGN KEY (`design_id`,`version_number`) REFERENCES `archive_design_versions`(`design_id`,`version_number`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_archive_idempotency_key_length" CHECK(length("archive_idempotency"."idempotency_key") BETWEEN 16 AND 100),
	CONSTRAINT "ck_archive_idempotency_operation" CHECK("archive_idempotency"."operation" IN ('create', 'update'))
);
--> statement-breakpoint
CREATE INDEX `idx_archive_idempotency_owner_design` ON `archive_idempotency` (`owner_user_id`,`design_id`);--> statement-breakpoint
CREATE TABLE `archive_receipts` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`design_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`novelty_hash` text NOT NULL,
	`exact_geometry_hash` text NOT NULL,
	`geometry_policy_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`design_id`,`version_number`) REFERENCES `archive_design_versions`(`design_id`,`version_number`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`design_id`,`owner_user_id`) REFERENCES `archive_designs`(`id`,`owner_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_archive_receipts_owner_version` ON `archive_receipts` (`owner_user_id`,`design_id`,`version_number`);