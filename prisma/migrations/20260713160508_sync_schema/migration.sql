/*
  Warnings:

  - The `level` column on the `Competition` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "announcementLink" TEXT,
ADD COLUMN     "announcementPoster" TEXT,
ADD COLUMN     "qris" TEXT,
ADD COLUMN     "whatsapp" TEXT,
DROP COLUMN "level",
ADD COLUMN     "level" TEXT[];

-- AlterTable
ALTER TABLE "Exam" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExamStage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Participant" ALTER COLUMN "updatedAt" DROP DEFAULT;
