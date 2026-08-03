-- AlterTable
ALTER TABLE "Todo" ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TaskDependency" (
    "dependentId" INTEGER NOT NULL,
    "dependencyId" INTEGER NOT NULL,

    PRIMARY KEY ("dependentId", "dependencyId"),
    CONSTRAINT "TaskDependency_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskDependency_dependencyId_fkey" FOREIGN KEY ("dependencyId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskDependency_dependencyId_idx" ON "TaskDependency"("dependencyId");