-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "campaign_task_type" AS ENUM ('REFERRAL');
CREATE TYPE "campaign_verification_type" AS ENUM ('AUTOMATIC_CHAIN');
CREATE TYPE "campaign_reward_type" AS ENUM ('POINTS');
CREATE TYPE "campaign_fulfillment_status" AS ENUM ('PENDING', 'VERIFIED', 'REWARDED');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" "campaign_status" NOT NULL DEFAULT 'ACTIVE',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaigns_schema_version_check" CHECK ("schema_version" > 0)
);

CREATE TABLE "campaign_tasks" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "type" "campaign_task_type" NOT NULL,
    "strategy_key" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaign_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_tasks_schema_version_check" CHECK ("schema_version" > 0)
);

CREATE TABLE "campaign_verification_policies" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "type" "campaign_verification_type" NOT NULL,
    "strategy_key" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaign_verification_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_verification_schema_version_check" CHECK ("schema_version" > 0)
);

CREATE TABLE "campaign_reward_policies" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "type" "campaign_reward_type" NOT NULL,
    "strategy_key" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaign_reward_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_reward_schema_version_check" CHECK ("schema_version" > 0)
);

CREATE TABLE "campaign_fulfillments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "referral_id" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT NOT NULL,
    "status" "campaign_fulfillment_status" NOT NULL DEFAULT 'PENDING',
    "chain_id" INTEGER NOT NULL,
    "verification_transaction_hash" TEXT,
    "verification_block_number" BIGINT,
    "verification_log_index" INTEGER,
    "reward_transaction_hash" TEXT,
    "reward_block_number" BIGINT,
    "reward_log_index" INTEGER,
    "verified_at" TIMESTAMP(3),
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaign_fulfillments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_fulfillments_attempt_check" CHECK ("attempt" > 0),
    CONSTRAINT "campaign_fulfillments_verification_event_check" CHECK (
        ("verification_transaction_hash" IS NULL AND "verification_block_number" IS NULL AND "verification_log_index" IS NULL)
        OR
        ("verification_transaction_hash" IS NOT NULL AND "verification_block_number" IS NOT NULL AND "verification_log_index" IS NOT NULL)
    ),
    CONSTRAINT "campaign_fulfillments_reward_event_check" CHECK (
        ("reward_transaction_hash" IS NULL AND "reward_block_number" IS NULL AND "reward_log_index" IS NULL)
        OR
        ("reward_transaction_hash" IS NOT NULL AND "reward_block_number" IS NOT NULL AND "reward_log_index" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_key_key" ON "campaigns"("key");
CREATE INDEX "campaigns_status_is_system_idx" ON "campaigns"("status", "is_system");
CREATE UNIQUE INDEX "campaign_tasks_campaign_id_key" ON "campaign_tasks"("campaign_id");
CREATE UNIQUE INDEX "campaign_verification_policies_task_id_key" ON "campaign_verification_policies"("task_id");
CREATE UNIQUE INDEX "campaign_reward_policies_task_id_key" ON "campaign_reward_policies"("task_id");
CREATE UNIQUE INDEX "campaign_fulfillments_referral_id_key" ON "campaign_fulfillments"("referral_id");
CREATE UNIQUE INDEX "campaign_fulfillments_idempotency_key_key" ON "campaign_fulfillments"("idempotency_key");
CREATE INDEX "campaign_fulfillments_participant_id_status_idx" ON "campaign_fulfillments"("participant_id", "status");
CREATE INDEX "campaign_fulfillments_task_id_status_idx" ON "campaign_fulfillments"("task_id", "status");
CREATE UNIQUE INDEX "campaign_fulfillments_task_participant_attempt_key"
ON "campaign_fulfillments"("task_id", "participant_id", "attempt");
CREATE UNIQUE INDEX "campaign_fulfillments_verification_event_key"
ON "campaign_fulfillments"("chain_id", "verification_transaction_hash", "verification_log_index");
CREATE UNIQUE INDEX "campaign_fulfillments_reward_event_key"
ON "campaign_fulfillments"("chain_id", "reward_transaction_hash", "reward_log_index");

-- AddForeignKey
ALTER TABLE "campaign_tasks"
ADD CONSTRAINT "campaign_tasks_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_verification_policies"
ADD CONSTRAINT "campaign_verification_policies_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "campaign_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_reward_policies"
ADD CONSTRAINT "campaign_reward_policies_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "campaign_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_fulfillments"
ADD CONSTRAINT "campaign_fulfillments_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "campaign_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_fulfillments"
ADD CONSTRAINT "campaign_fulfillments_participant_id_fkey"
FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_fulfillments"
ADD CONSTRAINT "campaign_fulfillments_referral_id_fkey"
FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Install the fixed built-in Referral campaign configuration.
INSERT INTO "campaigns" (
    "id", "key", "title", "description", "is_system", "status",
    "schema_version", "created_at", "updated_at"
)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'builtin-referral',
    'Referral',
    'Invite a new participant and establish the referral relationship used by campaign rewards.',
    true,
    'ACTIVE',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "campaign_tasks" (
    "id", "campaign_id", "type", "strategy_key", "schema_version",
    "configuration", "created_at", "updated_at"
)
SELECT
    '00000000-0000-4000-8000-000000000002',
    "id",
    'REFERRAL',
    'REFERRAL_V1',
    1,
    '{}'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "campaigns"
WHERE "key" = 'builtin-referral'
ON CONFLICT ("campaign_id") DO NOTHING;

INSERT INTO "campaign_verification_policies" (
    "id", "task_id", "type", "strategy_key", "schema_version",
    "configuration", "created_at", "updated_at"
)
SELECT
    '00000000-0000-4000-8000-000000000003',
    "campaign_tasks"."id",
    'AUTOMATIC_CHAIN',
    'REFERRAL_ACCEPTED_V1',
    1,
    '{}'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "campaign_tasks"
INNER JOIN "campaigns" ON "campaigns"."id" = "campaign_tasks"."campaign_id"
WHERE "campaigns"."key" = 'builtin-referral'
ON CONFLICT ("task_id") DO NOTHING;

INSERT INTO "campaign_reward_policies" (
    "id", "task_id", "type", "strategy_key", "schema_version",
    "configuration", "created_at", "updated_at"
)
SELECT
    '00000000-0000-4000-8000-000000000004',
    "campaign_tasks"."id",
    'POINTS',
    'REFERRAL_POINTS_V1',
    1,
    '{
      "completerAction": "ACCEPTED_INVITE",
      "referralPoolAction": "REFERRED_NEW_USER",
      "referralAllocation": "CONTRACT_CONFIGURED_SPLIT"
    }'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "campaign_tasks"
INNER JOIN "campaigns" ON "campaigns"."id" = "campaign_tasks"."campaign_id"
WHERE "campaigns"."key" = 'builtin-referral'
ON CONFLICT ("task_id") DO NOTHING;
