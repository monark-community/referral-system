/*
  Warnings:

  - You are about to drop the `Invite` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "referrals" DROP CONSTRAINT "referrals_referee_id_fkey";

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "invite_code" TEXT,
ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "referee_id" DROP NOT NULL;

-- DropTable
DROP TABLE "Invite";

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
