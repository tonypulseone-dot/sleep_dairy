CREATE TYPE "public"."entry_source" AS ENUM('timer', 'manual', 'photo');--> statement-breakpoint
CREATE TYPE "public"."feeding_type" AS ENUM('breast', 'formula', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'parsed', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('trial', 'practice', 'flow');--> statement-breakpoint
CREATE TYPE "public"."showcase_status" AS ENUM('hidden', 'pending', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."sleep_kind" AS ENUM('day', 'night');--> statement-breakpoint
CREATE TYPE "public"."theme_pref" AS ENUM('auto', 'light', 'dark');--> statement-breakpoint
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"consultant_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"consent_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"age_months_from" smallint NOT NULL,
	"age_months_to" smallint NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"birth_date" date NOT NULL,
	"due_date" date,
	"is_preterm" boolean DEFAULT false NOT NULL,
	"health_notes" text,
	"temperament" jsonb,
	"feeding_type" "feeding_type" DEFAULT 'breast' NOT NULL,
	"day_boundary_minutes" smallint DEFAULT 360 NOT NULL,
	"night_from_minutes" smallint DEFAULT 1140 NOT NULL,
	"show_rhythm_hint" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultant_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"consultant_id" uuid NOT NULL,
	"sleep_day" date,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"telegram_id" text,
	"phone" text,
	"plan" "plan" DEFAULT 'trial' NOT NULL,
	"plan_until" timestamp with time zone,
	"showcase_status" "showcase_status" DEFAULT 'hidden' NOT NULL,
	"city" text,
	"experience_years" smallint,
	"approach" text,
	"price_from" integer,
	"contact_url" text,
	"photo_url" text,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"sleep_day" date NOT NULL,
	"amount_ml" smallint,
	"note" text,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" text NOT NULL,
	"first_name" text,
	"time_zone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"theme_pref" "theme_pref" DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"parsed" jsonb,
	"parse_error" text,
	"records_parsed" smallint,
	"records_edited" smallint,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rhythm_norms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"age_months_from" smallint NOT NULL,
	"age_months_to" smallint NOT NULL,
	"wake_window_min" smallint,
	"wake_window_max" smallint,
	"naps_min" smallint,
	"naps_max" smallint,
	"day_sleep_min" smallint,
	"day_sleep_max" smallint,
	"night_sleep_min" smallint,
	"night_sleep_max" smallint
);
--> statement-breakpoint
CREATE TABLE "sleeps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"sleep_day" date NOT NULL,
	"kind" "sleep_kind" NOT NULL,
	"source" "entry_source" DEFAULT 'timer' NOT NULL,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_consultant_id_consultants_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."consultants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_notes" ADD CONSTRAINT "consultant_notes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_notes" ADD CONSTRAINT "consultant_notes_consultant_id_consultants_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."consultants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedings" ADD CONSTRAINT "feedings_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_imports" ADD CONSTRAINT "photo_imports_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleeps" ADD CONSTRAINT "sleeps_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grants_consultant_idx" ON "access_grants" USING btree ("consultant_id");--> statement-breakpoint
CREATE INDEX "access_grants_child_idx" ON "access_grants" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "activities_age_idx" ON "activities" USING btree ("age_months_from","age_months_to");--> statement-breakpoint
CREATE INDEX "children_parent_idx" ON "children" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "consultant_notes_child_idx" ON "consultant_notes" USING btree ("child_id","consultant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultants_email_key" ON "consultants" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "consultants_slug_key" ON "consultants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "consultants_showcase_idx" ON "consultants" USING btree ("showcase_status");--> statement-breakpoint
CREATE INDEX "feedings_child_day_idx" ON "feedings" USING btree ("child_id","sleep_day");--> statement-breakpoint
CREATE UNIQUE INDEX "parents_telegram_id_key" ON "parents" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "photo_imports_child_idx" ON "photo_imports" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "sleeps_child_day_idx" ON "sleeps" USING btree ("child_id","sleep_day");--> statement-breakpoint
CREATE INDEX "sleeps_child_started_idx" ON "sleeps" USING btree ("child_id","started_at");