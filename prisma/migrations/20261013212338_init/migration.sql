-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContextDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectName" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "markdownContent" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "reviews" TEXT NOT NULL DEFAULT '{}',
    "humanApproval" TEXT,
    "checkpoint" TEXT,
    "branch" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RunnerExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job" TEXT NOT NULL DEFAULT 'lint',
    "testPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "output" TEXT,
    "exitCode" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "projectProfile" TEXT
);
