-- AlterTable
ALTER TABLE "users" ADD COLUMN     "milestone_level" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "milestone_tiers" (
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "points_required" INTEGER NOT NULL,
    "benefits" TEXT[],

    CONSTRAINT "milestone_tiers_pkey" PRIMARY KEY ("level")
);
