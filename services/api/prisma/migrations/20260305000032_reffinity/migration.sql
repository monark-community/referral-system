-- CreateTable
CREATE TABLE "Invite" (
    "inviteId" VARCHAR(66) NOT NULL,
    "referrer" VARCHAR(42) NOT NULL,
    "status" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("inviteId")
);

-- CreateIndex
CREATE INDEX "Invite_referrer_idx" ON "Invite"("referrer");
