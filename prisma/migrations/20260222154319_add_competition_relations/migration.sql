-- CreateTable
CREATE TABLE "CompetitionRequirement" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "CompetitionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionTimeline" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionTimeline_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompetitionRequirement" ADD CONSTRAINT "CompetitionRequirement_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTimeline" ADD CONSTRAINT "CompetitionTimeline_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
