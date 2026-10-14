CREATE TABLE "activity_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" smallint NOT NULL,
	"title" text NOT NULL,
	"age_months_from" smallint NOT NULL,
	"age_months_to" smallint NOT NULL,
	"intro" text,
	"sections" jsonb NOT NULL,
	"published" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_groups_age_idx" ON "activity_groups" USING btree ("age_months_from","age_months_to");