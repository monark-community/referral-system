ALTER TYPE "campaign_reward_type" ADD VALUE 'DIRECT';

ALTER TABLE "campaign_fulfillments"
ADD COLUMN "completer_reward_wei" TEXT;

ALTER TABLE "campaigns"
ADD COLUMN "chain_status" TEXT,
ADD COLUMN "chain_balance_wei" TEXT;

CREATE TABLE "direct_campaign_settlements" (
    "id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "participant_wallet_address" TEXT NOT NULL,
    "completer_amount_wei" TEXT NOT NULL,
    "referral_pool_wei" TEXT NOT NULL,
    "direct_recipient_wallet_address" TEXT NOT NULL,
    "direct_amount_wei" TEXT NOT NULL,
    "grandparent_recipient_wallet_address" TEXT NOT NULL,
    "grandparent_amount_wei" TEXT NOT NULL,
    "unallocated_amount_wei" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "direct_campaign_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "direct_campaign_settlements_fulfillment_id_key"
ON "direct_campaign_settlements"("fulfillment_id");
CREATE UNIQUE INDEX "direct_campaign_settlements_chain_id_transaction_hash_log_index_key"
ON "direct_campaign_settlements"("chain_id", "transaction_hash", "log_index");
CREATE INDEX "direct_campaign_settlements_participant_wallet_address_idx"
ON "direct_campaign_settlements"("participant_wallet_address");
CREATE INDEX "direct_campaign_settlements_direct_recipient_wallet_address_idx"
ON "direct_campaign_settlements"("direct_recipient_wallet_address");
CREATE INDEX "direct_campaign_settlements_grandparent_recipient_wallet_address_idx"
ON "direct_campaign_settlements"("grandparent_recipient_wallet_address");
ALTER TABLE "direct_campaign_settlements"
ADD CONSTRAINT "direct_campaign_settlements_fulfillment_id_fkey"
FOREIGN KEY ("fulfillment_id") REFERENCES "campaign_fulfillments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "direct_reward_event_type" AS ENUM ('ACCRUED', 'WITHDRAWN');
CREATE TABLE "direct_reward_events" (
    "id" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "type" "direct_reward_event_type" NOT NULL,
    "account" TEXT NOT NULL,
    "destination" TEXT,
    "amount_wei" TEXT NOT NULL,
    "balance_after_wei" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "direct_reward_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "direct_reward_events_chain_id_transaction_hash_log_index_key"
ON "direct_reward_events"("chain_id", "transaction_hash", "log_index");
CREATE INDEX "direct_reward_events_account_observed_at_idx"
ON "direct_reward_events"("account", "observed_at");
