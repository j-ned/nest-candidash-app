/*
  Warnings:

  - You are about to drop the column `attachments` on the `Annonces` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Annonces" DROP COLUMN "attachments";

-- CreateTable
CREATE TABLE "public"."CodesVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodesVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UtilisateursEnAttente" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "originalPassword" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilisateursEnAttente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodesVerification_email_key" ON "public"."CodesVerification"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UtilisateursEnAttente_email_key" ON "public"."UtilisateursEnAttente"("email");
