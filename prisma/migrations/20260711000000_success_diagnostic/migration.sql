-- CreateEnum
CREATE TYPE "DiagnosticClass" AS ENUM ('ENTRY', 'EMERGING', 'DEVELOPING', 'ADVANCED', 'ELITE');

-- CreateEnum
CREATE TYPE "DiagnosticRisk" AS ENUM ('NEEDS_IMPROVEMENT', 'MODERATE', 'ON_TRACK', 'STRONG');

-- CreateEnum
CREATE TYPE "DiagnosticStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "diagnostic_results" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "status" "DiagnosticStatus" NOT NULL DEFAULT 'COMPLETED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "state" TEXT,
    "subject_profile_id" TEXT,
    "recruiter_code" TEXT,
    "recruiter_name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'public_link',
    "overall_score" INTEGER NOT NULL,
    "overall_class" "DiagnosticClass" NOT NULL,
    "risk" "DiagnosticRisk" NOT NULL,
    "limiting_module" TEXT NOT NULL,
    "recommended_focus" TEXT NOT NULL,
    "module_scores" JSONB NOT NULL,
    "probabilities" JSONB NOT NULL,
    "consistency_index" INTEGER NOT NULL,
    "consistency_penalty_pct" INTEGER NOT NULL,
    "consistency_label" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "page_url" TEXT,

    CONSTRAINT "diagnostic_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_results_subject_profile_id_idx" ON "diagnostic_results"("subject_profile_id");

-- CreateIndex
CREATE INDEX "diagnostic_results_recruiter_code_idx" ON "diagnostic_results"("recruiter_code");

-- CreateIndex
CREATE INDEX "diagnostic_results_overall_class_created_at_idx" ON "diagnostic_results"("overall_class", "created_at");

-- CreateIndex
CREATE INDEX "diagnostic_results_created_at_idx" ON "diagnostic_results"("created_at");
