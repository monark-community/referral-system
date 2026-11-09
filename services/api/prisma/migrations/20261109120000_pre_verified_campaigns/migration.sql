-- Pre-verified campaigns: the creator lists the winners' wallets beforehand, and only those wallets can claim

-- CreateEnum
CREATE TYPE "campaign_winner_status" AS ENUM ('LISTED', 'RESERVED', 'CLAIMED', 'REWARDED', 'REMOVED');

-- AlterEnum
ALTER TYPE "campaign_verification_type" ADD VALUE 'PRE_VERIFIED';

-- AlterTable
ALTER TABLE "direct_campaign_settlements" ADD COLUMN     "winner_id" TEXT,
ALTER COLUMN "fulfillment_id" DROP NOT NULL;

-- A Direct payout belongs to exactly one of a manual submission or a pre-verified winner
ALTER TABLE "direct_campaign_settlements" ADD CONSTRAINT "direct_campaign_settlements_one_source_check"
CHECK (num_nonnulls("fulfillment_id", "winner_id") = 1);

-- CreateTable
CREATE TABLE "campaign_winners" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "label" TEXT,
    "status" "campaign_winner_status" NOT NULL DEFAULT 'LISTED',
    "chain_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reservation_transaction_hash" TEXT,
    "reservation_block_number" BIGINT,
    "reservation_log_index" INTEGER,
    "reserved_at" TIMESTAMP(3),
    "claim_transaction_hash" TEXT,
    "claim_block_number" BIGINT,
    "claim_log_index" INTEGER,
    "claimed_at" TIMESTAMP(3),
    "reward_transaction_hash" TEXT,
    "reward_block_number" BIGINT,
    "reward_log_index" INTEGER,
    "rewarded_at" TIMESTAMP(3),
    "completer_reward" INTEGER,
    "completer_reward_wei" TEXT,

    CONSTRAINT "campaign_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_winners_wallet_address_status_idx" ON "campaign_winners"("wallet_address", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_winners_campaign_id_wallet_address_key" ON "campaign_winners"("campaign_id", "wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_winners_reservation_event_key" ON "campaign_winners"("chain_id", "reservation_transaction_hash", "reservation_log_index");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_winners_claim_event_key" ON "campaign_winners"("chain_id", "claim_transaction_hash", "claim_log_index");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_winners_reward_event_key" ON "campaign_winners"("chain_id", "reward_transaction_hash", "reward_log_index");

-- CreateIndex
CREATE UNIQUE INDEX "direct_campaign_settlements_winner_id_key" ON "direct_campaign_settlements"("winner_id");

-- AddForeignKey
ALTER TABLE "campaign_winners" ADD CONSTRAINT "campaign_winners_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_campaign_settlements" ADD CONSTRAINT "direct_campaign_settlements_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "campaign_winners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
