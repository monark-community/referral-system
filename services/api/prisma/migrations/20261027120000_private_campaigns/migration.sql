-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "private_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_private_code_key" ON "campaigns"("private_code");
