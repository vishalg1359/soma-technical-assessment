-- AlterTable
ALTER TABLE "Todo" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Todo" ADD COLUMN "imageAlt" TEXT;
ALTER TABLE "Todo" ADD COLUMN "imageCredit" TEXT;
ALTER TABLE "Todo" ADD COLUMN "imageStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Todo" ADD COLUMN "imageCheckedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Todo_imageStatus_idx" ON "Todo"("imageStatus");