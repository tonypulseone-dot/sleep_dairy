CREATE TYPE "public"."child_sex" AS ENUM('boy', 'girl');--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "sex" "child_sex";