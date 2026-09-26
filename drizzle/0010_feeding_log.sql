ALTER TABLE "children" ADD COLUMN "feeding_log" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Кто уже на смеси или смешанном — у тех дневник кормлений был и остаётся.
UPDATE "children" SET "feeding_log" = true WHERE "feeding_type" <> 'breast';
