import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { validateActionContextDocument } from "@/lib/action-context";
import type { ActionContextReference } from "@/types/action-context";
import { QaValidationError } from "@/lib/qa-domain";

export async function verifyQaContextReferences(
  references: ActionContextReference[],
  notebookId: string | null,
  database: Pick<Prisma.TransactionClient, "contextDocument"> = prisma,
): Promise<void> {
  if (references.length === 0) {
    if (notebookId) throw new QaValidationError("No se admite un cuaderno sin referencias de contexto.");
    return;
  }
  if (!notebookId || !notebookId.trim()) {
    throw new QaValidationError("Las referencias de contexto requieren un cuaderno.");
  }
  const documents = await database.contextDocument.findMany({
    where: {
      id: { in: references.map((reference) => reference.documentId) },
      notebookId,
    },
    select: {
      id: true,
      moduleName: true,
      sourceType: true,
      markdownContent: true,
    },
  });
  if (documents.length !== references.length) {
    throw new QaValidationError("Una o más fuentes ya no pertenecen al cuaderno indicado.");
  }
  const byId = new Map(documents.map((document) => [document.id, document]));
  for (const reference of references) {
    const document = byId.get(reference.documentId);
    if (
      !document ||
      !validateActionContextDocument({
        title: document.moduleName,
        sourceType: document.sourceType,
        markdownContent: document.markdownContent,
      })
    ) {
      throw new QaValidationError("Las fuentes asociadas deben ser documentos Markdown no vacíos y válidos.");
    }
    const digest = createHash("sha256").update(document.markdownContent).digest("hex");
    if (reference.title !== document.moduleName || reference.sha256 !== digest) {
      throw new QaValidationError("Una fuente Markdown cambió desde que se generó el borrador.");
    }
  }
}
