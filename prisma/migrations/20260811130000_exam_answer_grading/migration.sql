-- AlterTable
ALTER TABLE "ExamAnswer" ADD COLUMN     "pointsEarned" DOUBLE PRECISION,
ADD COLUMN     "isCorrect" BOOLEAN,
ADD COLUMN     "gradedManually" BOOLEAN NOT NULL DEFAULT false;
