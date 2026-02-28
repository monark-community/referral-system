-- CreateTable
CREATE TABLE "ChainSyncState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastProcessedBlock" BIGINT NOT NULL,
    "lastProcessedLogIndex" INTEGER NOT NULL,

    CONSTRAINT "ChainSyncState_pkey" PRIMARY KEY ("id")
);
