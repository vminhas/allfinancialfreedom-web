-- CreateTable
CREATE TABLE "personal_financial_reviews" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "monthlyIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expenses" JSONB NOT NULL DEFAULT '{}',
    "assets" JSONB NOT NULL DEFAULT '{}',
    "debts" JSONB NOT NULL DEFAULT '{}',
    "buckets" JSONB NOT NULL DEFAULT '{}',
    "retirementAge" INTEGER,
    "spouseRetAge" INTEGER,
    "desiredMonthlyRetirement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlySavingsCommitment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "whatWouldThisDo" TEXT,
    "whatIsStopping" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_financial_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_financial_reviews_agentProfileId_key" ON "personal_financial_reviews"("agentProfileId");

-- AddForeignKey
ALTER TABLE "personal_financial_reviews" ADD CONSTRAINT "personal_financial_reviews_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
