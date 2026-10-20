CREATE TABLE "ActionApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "resultSummary" TEXT,
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ActionApproval_status_expiresAt_idx" ON "ActionApproval"("status", "expiresAt");
CREATE INDEX "ActionApproval_operation_target_idx" ON "ActionApproval"("operation", "target");

ALTER TABLE "Proposal" ADD COLUMN "approvedDiffHash" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "approvedAt" DATETIME;

ALTER TABLE "RunnerExecution" ADD COLUMN "error" TEXT;
ALTER TABLE "RunnerExecution" ADD COLUMN "command" TEXT;
ALTER TABLE "RunnerExecution" ADD COLUMN "approvalId" TEXT;
CREATE INDEX "RunnerExecution_status_startedAt_idx" ON "RunnerExecution"("status", "startedAt");
CREATE INDEX "RunnerExecution_approvalId_idx" ON "RunnerExecution"("approvalId");
