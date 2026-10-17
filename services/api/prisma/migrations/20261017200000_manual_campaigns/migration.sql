-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "campaign_fulfillment_status" ADD VALUE 'SUBMITTED';
ALTER TYPE "campaign_fulfillment_status" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "campaign_fulfillment_status" ADD VALUE 'APPROVED';
ALTER TYPE "campaign_fulfillment_status" ADD VALUE 'REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "campaign_status" ADD VALUE 'DRAFT';
ALTER TYPE "campaign_status" ADD VALUE 'PAUSED';
ALTER TYPE "campaign_status" ADD VALUE 'ENDED';
ALTER TYPE "campaign_status" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "campaign_task_type" ADD VALUE 'BOUNTY';

-- AlterEnum
ALTER TYPE "campaign_verification_type" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "ChainSyncState" ADD COLUMN     "lastCampaignEventBlock" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "lastCampaignEventLogIndex" INTEGER NOT NULL DEFAULT -1;

-- AlterTable
ALTER TABLE "campaign_fulfillments" ADD COLUMN     "completer_reward" INTEGER,
ADD COLUMN     "proof" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "submission_block_number" BIGINT,
ADD COLUMN     "submission_log_index" INTEGER,
ADD COLUMN     "submission_transaction_hash" TEXT,
ADD COLUMN     "submitted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "ends_at" TIMESTAMP(3),
ADD COLUMN     "instructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "max_completions" INTEGER,
ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "publish_transaction_hash" TEXT,
ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_fulfillments_submission_event_key" ON "campaign_fulfillments"("chain_id", "submission_transaction_hash", "submission_log_index");

-- CreateIndex
CREATE INDEX "campaigns_owner_id_idx" ON "campaigns"("owner_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

