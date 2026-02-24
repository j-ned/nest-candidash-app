-- Convert all PENDING rows to APPLIED before removing the enum value
UPDATE "Annonces" SET "status" = 'APPLIED' WHERE "status" = 'PENDING';

-- Remove PENDING from JobStatus enum
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
CREATE TYPE "JobStatus" AS ENUM ('APPLIED', 'INTERVIEW', 'REJECTED', 'ACCEPTED');
ALTER TABLE "Annonces" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Annonces" ALTER COLUMN "status" TYPE "JobStatus" USING ("status"::text::"JobStatus");
ALTER TABLE "Annonces" ALTER COLUMN "status" SET DEFAULT 'APPLIED';
DROP TYPE "JobStatus_old";
