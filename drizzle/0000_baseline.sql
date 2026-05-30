DO $$ BEGIN CREATE TYPE "public"."ContractType" AS ENUM('CDI', 'CDD', 'INTERIM', 'STAGE', 'ALTERNANCE', 'FREELANCE'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."JobStatus" AS ENUM('APPLIED', 'INTERVIEW', 'REJECTED', 'ACCEPTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'USER'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Annonces" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"jobUrl" text,
	"appliedAt" timestamp (3),
	"status" "JobStatus" DEFAULT 'APPLIED' NOT NULL,
	"contractType" "ContractType",
	"notes" text,
	"cvFileName" text,
	"lmFileName" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UtilisateursEnAttente" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"password" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Relance" (
	"id" text PRIMARY KEY NOT NULL,
	"jobTrackId" text NOT NULL,
	"frequency" integer NOT NULL,
	"nextReminderAt" timestamp (3) NOT NULL,
	"lastSentAt" timestamp (3),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserTracking" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"totalApplications" integer DEFAULT 0 NOT NULL,
	"totalRemindersSent" integer DEFAULT 0 NOT NULL,
	"applicationsPerStatus" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lastActionAt" timestamp (3),
	"responseRate" double precision DEFAULT 0,
	"remindersEffectiveness" double precision DEFAULT 0,
	"avgResponseTime" double precision DEFAULT 0,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Utilisateurs" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"password" text NOT NULL,
	"role" "Role" DEFAULT 'USER' NOT NULL,
	"refreshToken" text,
	"refreshTokenExpires" timestamp (3),
	"resetPasswordToken" text,
	"resetPasswordExpires" timestamp (3),
	"totpSecret" text,
	"totpEnabled" boolean DEFAULT false NOT NULL,
	"totpRecoveryCodes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CodesVerification" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "Annonces" ADD CONSTRAINT "Annonces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Utilisateurs"("id") ON DELETE cascade ON UPDATE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "Relance" ADD CONSTRAINT "Relance_jobTrackId_fkey" FOREIGN KEY ("jobTrackId") REFERENCES "public"."Annonces"("id") ON DELETE cascade ON UPDATE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "UserTracking" ADD CONSTRAINT "UserTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Utilisateurs"("id") ON DELETE cascade ON UPDATE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Annonces_userId_idx" ON "Annonces" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UtilisateursEnAttente_email_key" ON "UtilisateursEnAttente" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Relance_jobTrackId_idx" ON "Relance" USING btree ("jobTrackId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Relance_isActive_nextReminderAt_idx" ON "Relance" USING btree ("isActive","nextReminderAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Utilisateurs_email_key" ON "Utilisateurs" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CodesVerification_email_key" ON "CodesVerification" USING btree ("email");