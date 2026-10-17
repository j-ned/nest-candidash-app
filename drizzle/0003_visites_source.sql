ALTER TABLE "Visites" ADD COLUMN "source" text;--> statement-breakpoint
UPDATE "Visites" SET "source" = regexp_replace("referrerHost", '^www\.', '') WHERE "referrerHost" IS NOT NULL;
