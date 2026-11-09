-- Existing rows came from the only previously supported runtime: local Hardhat.
CREATE SEQUENCE "ChainSyncState_id_seq";
SELECT setval(
  '"ChainSyncState_id_seq"',
  COALESCE((SELECT MAX("id") FROM "ChainSyncState"), 0) + 1,
  false
);
ALTER SEQUENCE "ChainSyncState_id_seq" OWNED BY "ChainSyncState"."id";
ALTER TABLE "ChainSyncState"
ALTER COLUMN "id" SET DEFAULT nextval('"ChainSyncState_id_seq"');

ALTER TABLE "ChainSyncState"
ADD COLUMN "chainId" INTEGER NOT NULL DEFAULT 31337,
ADD COLUMN "contractAddress" TEXT NOT NULL DEFAULT '0x5fbdb2315678afecb367f032d93f642f64180aa3';

CREATE UNIQUE INDEX "ChainSyncState_chainId_contractAddress_key"
ON "ChainSyncState"("chainId", "contractAddress");

ALTER TABLE "referral_point_allocations"
ADD COLUMN "chain_id" INTEGER NOT NULL DEFAULT 31337;

DROP INDEX "referral_point_allocations_transaction_hash_log_index_key";
CREATE UNIQUE INDEX "referral_point_allocations_chain_id_transaction_hash_log_index_key"
ON "referral_point_allocations"("chain_id", "transaction_hash", "log_index");
