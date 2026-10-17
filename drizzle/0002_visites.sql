CREATE TABLE "Visites" (
	"id" text PRIMARY KEY NOT NULL,
	"visitorHash" text NOT NULL,
	"path" text NOT NULL,
	"referrerHost" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "Visites_createdAt_idx" ON "Visites" USING btree ("createdAt");