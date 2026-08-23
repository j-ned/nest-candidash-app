-- ATTENTION : ne pas utiliser 'TO_APPLY' en DDL/DML dans une migration tant
-- qu'elle peut être appliquée dans le même batch transactionnel que celle-ci
-- (drizzle-kit applique toutes les migrations en attente dans une seule
-- transaction ; Postgres interdit d'utiliser une valeur d'enum tout juste
-- ajoutée dans la même transaction).
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'TO_APPLY' BEFORE 'APPLIED';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Jetons" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"nomAffiche" text NOT NULL,
	"tokenHash" text NOT NULL,
	"derniereUtilisation" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"revokedAt" timestamp (3)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "Jetons" ADD CONSTRAINT "Jetons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Utilisateurs"("id") ON DELETE cascade ON UPDATE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Jetons_tokenHash_key" ON "Jetons" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Jetons_userId_idx" ON "Jetons" USING btree ("userId");