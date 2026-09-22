CREATE TABLE "rhythm_norms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"age_months_from" smallint NOT NULL,
	"age_months_to" smallint NOT NULL,
	"naps_count" smallint,
	"wake_windows" jsonb,
	"total_wake_min" smallint,
	"total_wake_max" smallint,
	"day_sleep_min" smallint,
	"day_sleep_max" smallint,
	"night_sleep_min" smallint,
	"night_sleep_max" smallint,
	"total_sleep_min" smallint,
	"total_sleep_max" smallint,
	"note" text
);
--> statement-breakpoint
CREATE INDEX "rhythm_norms_age_idx" ON "rhythm_norms" USING btree ("age_months_from","age_months_to");