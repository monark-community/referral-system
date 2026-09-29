-- CreateTable
CREATE TABLE "referral_point_allocations" (
    "id" TEXT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "participant_wallet_address" TEXT NOT NULL,
    "pool" INTEGER NOT NULL,
    "direct_recipient_wallet_address" TEXT NOT NULL,
    "direct_amount" INTEGER NOT NULL,
    "grandparent_recipient_wallet_address" TEXT NOT NULL,
    "grandparent_amount" INTEGER NOT NULL,
    "unallocated_amount" INTEGER NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_point_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_point_allocations_transaction_hash_log_index_key"
ON "referral_point_allocations"("transaction_hash", "log_index");

-- CreateIndex
CREATE INDEX "referral_point_allocations_participant_wallet_address_idx"
ON "referral_point_allocations"("participant_wallet_address");

-- CreateIndex
CREATE INDEX "referral_point_allocations_direct_recipient_wallet_address_idx"
ON "referral_point_allocations"("direct_recipient_wallet_address");

-- CreateIndex
CREATE INDEX "referral_point_allocations_grandparent_recipient_wallet_address_idx"
ON "referral_point_allocations"("grandparent_recipient_wallet_address");

-- AlterTable
ALTER TABLE "ChainSyncState"
ADD COLUMN "lastReferralAllocationBlock" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "lastReferralAllocationLogIndex" INTEGER NOT NULL DEFAULT -1;
