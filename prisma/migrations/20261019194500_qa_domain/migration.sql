CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "acceptanceCriteria" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "origin" TEXT NOT NULL DEFAULT 'LOCAL',
    "externalProvider" TEXT,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Requirement_key_key" ON "Requirement"("key");
CREATE INDEX "Requirement_status_updatedAt_idx" ON "Requirement"("status", "updatedAt");
CREATE INDEX "Requirement_origin_externalProvider_externalId_idx" ON "Requirement"("origin", "externalProvider", "externalId");

CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'manual',
    "gherkin" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contextReferences" TEXT NOT NULL DEFAULT '[]',
    "contextNotebookId" TEXT,
    "contentHash" TEXT NOT NULL,
    "sourceActionLogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_sourceActionLogId_fkey" FOREIGN KEY ("sourceActionLogId") REFERENCES "AgentActionLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TestCase_status_updatedAt_idx" ON "TestCase"("status", "updatedAt");
CREATE INDEX "TestCase_sourceActionLogId_idx" ON "TestCase"("sourceActionLogId");

CREATE TABLE "TestCaseRequirement" (
    "requirementId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("requirementId", "testCaseId"),
    CONSTRAINT "TestCaseRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCaseRequirement_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TestCaseRequirement_testCaseId_idx" ON "TestCaseRequirement"("testCaseId");

CREATE TABLE "TestPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "TestPlan_status_updatedAt_idx" ON "TestPlan"("status", "updatedAt");

CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "TestSuite_status_updatedAt_idx" ON "TestSuite"("status", "updatedAt");

CREATE TABLE "TestPlanSuite" (
    "testPlanId" TEXT NOT NULL,
    "testSuiteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("testPlanId", "testSuiteId"),
    CONSTRAINT "TestPlanSuite_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "TestPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestPlanSuite_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TestPlanSuite_testSuiteId_idx" ON "TestPlanSuite"("testSuiteId");

CREATE TABLE "TestSuiteCase" (
    "testSuiteId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("testSuiteId", "testCaseId"),
    CONSTRAINT "TestSuiteCase_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestSuiteCase_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TestSuiteCase_testCaseId_idx" ON "TestSuiteCase"("testCaseId");

CREATE TABLE "Bug" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "stepsToReproduce" TEXT NOT NULL DEFAULT '[]',
    "expected" TEXT NOT NULL DEFAULT '',
    "observed" TEXT NOT NULL DEFAULT '',
    "testCaseId" TEXT,
    "runnerExecutionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bug_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bug_runnerExecutionId_fkey" FOREIGN KEY ("runnerExecutionId") REFERENCES "RunnerExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Bug_status_severity_updatedAt_idx" ON "Bug"("status", "severity", "updatedAt");
CREATE INDEX "Bug_testCaseId_idx" ON "Bug"("testCaseId");
CREATE INDEX "Bug_runnerExecutionId_idx" ON "Bug"("runnerExecutionId");
