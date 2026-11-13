CREATE TABLE "consultant_profiles" (
	"consultant_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "is_moderator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consultants" ADD COLUMN "services" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "consultant_profiles" ADD CONSTRAINT "consultant_profiles_consultant_id_consultants_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."consultants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Existing owner, verified against the production account before this migration.
UPDATE consultants SET is_moderator = true WHERE slug = 'viktoria';
