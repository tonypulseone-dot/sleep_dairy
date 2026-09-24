CREATE TYPE "public"."activity_energy" AS ENUM('active', 'explore', 'calm');--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "energy" "activity_energy" DEFAULT 'explore' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "minutes" smallint;