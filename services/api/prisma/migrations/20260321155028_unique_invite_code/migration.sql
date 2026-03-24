/*
  Warnings:

  - A unique constraint covering the columns `[invite_code]` on the table `referrals` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "referrals_invite_code_key" ON "referrals"("invite_code");
