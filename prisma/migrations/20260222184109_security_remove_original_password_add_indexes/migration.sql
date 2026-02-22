/*
  Warnings:

  - You are about to drop the column `originalPassword` on the `UtilisateursEnAttente` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."UtilisateursEnAttente" DROP COLUMN "originalPassword";

-- CreateIndex
CREATE INDEX "Annonces_userId_idx" ON "public"."Annonces"("userId");

-- CreateIndex
CREATE INDEX "Relance_jobTrackId_idx" ON "public"."Relance"("jobTrackId");

-- CreateIndex
CREATE INDEX "Relance_isActive_nextReminderAt_idx" ON "public"."Relance"("isActive", "nextReminderAt");
