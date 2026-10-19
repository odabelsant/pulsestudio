CREATE TABLE "ContextNotebook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ContextNotebook_updatedAt_idx" ON "ContextNotebook"("updatedAt");

INSERT INTO "ContextNotebook" ("id", "title", "createdAt", "updatedAt")
SELECT 'legacy-' || lower(hex(randomblob(12))), "projectName", MIN("createdAt"), CURRENT_TIMESTAMP
FROM "ContextDocument"
GROUP BY "projectName";

ALTER TABLE "ContextDocument" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "ContextDocument" ADD COLUMN "notebookId" TEXT REFERENCES "ContextNotebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "ContextDocument"
SET "notebookId" = (
    SELECT "id"
    FROM "ContextNotebook"
    WHERE "ContextNotebook"."title" = "ContextDocument"."projectName"
    ORDER BY "ContextNotebook"."createdAt" ASC
    LIMIT 1
);

CREATE INDEX "ContextDocument_notebookId_createdAt_idx" ON "ContextDocument"("notebookId", "createdAt");
