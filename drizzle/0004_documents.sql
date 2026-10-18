CREATE TYPE "public"."DocumentKind" AS ENUM('CV', 'LETTER');--> statement-breakpoint
CREATE TABLE "Documents" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"kind" "DocumentKind" NOT NULL,
	"title" text NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"template" text DEFAULT 'sobre' NOT NULL,
	"baseDocumentId" text,
	"jobTrackId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Documents" ADD CONSTRAINT "Documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Utilisateurs"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Documents" ADD CONSTRAINT "Documents_jobTrackId_fkey" FOREIGN KEY ("jobTrackId") REFERENCES "public"."Annonces"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "Documents_userId_idx" ON "Documents" USING btree ("userId");