import type {
  ActionContextPurpose,
  ActionContextChoice,
  ActionContextReference,
  ActionContextSelection,
  ActionProposal,
  ActionStatus,
} from "@/types/action-context";

const ALLOWED_TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  proposed: ["validation_pending", "cancelled"],
  validation_pending: ["authorization_pending", "running", "failed", "cancelled"],
  authorization_pending: ["approved", "cancelled"],
  approved: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export class InvalidActionContextError extends Error {
  status = 400;
}

export class ChangedActionContextError extends InvalidActionContextError {
  status = 409;
}

export interface ActionContextDocument {
  id: string;
  title: string;
  markdownContent: string;
}

const ACTION_CATEGORIES = new Set([
  "manual",
  "automated",
  "performance",
  "api",
  "sql",
  "positive",
  "negative",
]);

export function isActionContextPurpose(value: unknown): value is ActionContextPurpose {
  return value === "procedure" || value === "work-data";
}

export function isValidActionTestCases(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return false;
  return value.every((testCase) =>
    typeof testCase === "object" &&
    testCase !== null &&
    "title" in testCase &&
    typeof testCase.title === "string" &&
    Boolean(testCase.title.trim()) &&
    testCase.title.length <= 240 &&
    "category" in testCase &&
    typeof testCase.category === "string" &&
    ACTION_CATEGORIES.has(testCase.category) &&
    "gherkin" in testCase &&
    typeof testCase.gherkin === "string" &&
    Boolean(testCase.gherkin.trim()) &&
    testCase.gherkin.length <= 8_000 &&
    "steps" in testCase &&
    Array.isArray(testCase.steps) &&
    testCase.steps.length > 0 &&
    testCase.steps.length <= 50 &&
    testCase.steps.every((step: unknown) =>
      typeof step === "object" &&
      step !== null &&
      "step" in step &&
      typeof step.step === "string" &&
      Boolean(step.step.trim()) &&
      step.step.length <= 2_000 &&
      "expectedResult" in step &&
      typeof step.expectedResult === "string" &&
      Boolean(step.expectedResult.trim()) &&
      step.expectedResult.length <= 2_000,
    ),
  );
}

export function isAllowedAgentActionRecord(
  actionType: unknown,
  status: unknown,
  cases: unknown,
): boolean {
  if (!Array.isArray(cases) || cases.length > 12) return false;
  if (actionType === "CLEARED") {
    return status === "DRAFT" && isValidActionTestCases(cases);
  }
  if (actionType !== "GENERATED") return false;
  if (status === "DRAFT") return isValidActionTestCases(cases);
  return (status === "FAILED" || status === "CANCELLED") &&
    (cases.length === 0 || isValidActionTestCases(cases));
}

export function validateActionContextSelections(
  value: unknown,
): ActionContextChoice[] {
  if (!Array.isArray(value) || value.length > 4) {
    throw new Error("Selecciona como máximo cuatro fuentes Markdown para la acción.");
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("documentId" in entry) ||
      typeof entry.documentId !== "string" ||
      !entry.documentId.trim() ||
      entry.documentId.length > 200 ||
      !("purpose" in entry) ||
      !isActionContextPurpose(entry.purpose) ||
      seen.has(entry.documentId)
    ) {
      throw new Error("La selección de fuentes de contexto no es válida.");
    }
    seen.add(entry.documentId);
    return { documentId: entry.documentId, purpose: entry.purpose };
  });
}

export function validateActionContextRequest(value: unknown): ActionContextSelection[] {
  if (!Array.isArray(value) || value.length > 4) {
    throw new InvalidActionContextError("Selecciona como máximo cuatro fuentes Markdown para la acción.");
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("documentId" in entry) ||
      typeof entry.documentId !== "string" ||
      !entry.documentId.trim() ||
      entry.documentId.length > 200 ||
      !("purpose" in entry) ||
      !isActionContextPurpose(entry.purpose) ||
      !("sha256" in entry) ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(entry.sha256) ||
      seen.has(entry.documentId)
    ) {
      throw new InvalidActionContextError("La selección de fuentes de contexto no es válida.");
    }
    seen.add(entry.documentId);
    return {
      documentId: entry.documentId,
      purpose: entry.purpose,
      sha256: entry.sha256.toLowerCase(),
    };
  });
}

export async function createActionContextReferences(
  selections: ActionContextChoice[],
  documents: ActionContextDocument[],
): Promise<ActionContextReference[]> {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const references = await Promise.all(selections.map(async (selection) => {
    const document = documentsById.get(selection.documentId);
    if (!document) {
      throw new InvalidActionContextError("Una de las fuentes seleccionadas ya no está disponible en el cuaderno activo.");
    }
    if (
      !/\.(md|mdx)$/i.test(document.title) ||
      !document.markdownContent.trim() ||
      document.markdownContent.length > 1_000_000
    ) {
      throw new InvalidActionContextError("Una fuente seleccionada está vacía, es demasiado grande o no es Markdown válido.");
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(document.markdownContent),
    );
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return {
      ...selection,
      title: document.title,
      sha256,
    };
  }));
  return references;
}

export function validateActionContextDocument(input: {
  title: string;
  sourceType: string | null;
  markdownContent: string;
}): boolean {
  return (
    /\.(md|mdx)$/i.test(input.title) &&
    (input.sourceType?.toLowerCase() === "md" || input.sourceType?.toLowerCase() === "mdx") &&
    Boolean(input.markdownContent.trim()) &&
    input.markdownContent.length <= 1_000_000
  );
}

export function createActionProposal(input: {
  inputs: ActionProposal["inputs"];
  contexts: ActionContextReference[];
  now?: Date;
}): ActionProposal {
  return {
    id: crypto.randomUUID(),
    module: "action-agent",
    objective: "generate-test-cases",
    inputs: input.inputs,
    contexts: input.contexts,
    requiredCapabilities: ["ai.generate-test-cases"],
    authorization: "not-required-local-only",
    status: "proposed",
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}

export function transitionActionStatus(
  proposal: ActionProposal,
  status: ActionStatus,
): ActionProposal {
  if (!ALLOWED_TRANSITIONS[proposal.status].includes(status)) {
    throw new Error(`Transición de acción no permitida: ${proposal.status} → ${status}.`);
  }
  return { ...proposal, status };
}

export function encodeActionAudit(
  summary: string,
  contextReferences: ActionContextReference[],
): string {
  return JSON.stringify({
    version: 1,
    summary,
    contextReferences,
  });
}

export function decodeActionAudit(value: string): {
  summary: string;
  contextReferences: ActionContextReference[];
} {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      parsed.version === 1 &&
      "summary" in parsed &&
      typeof parsed.summary === "string" &&
      "contextReferences" in parsed &&
      Array.isArray(parsed.contextReferences)
    ) {
      return {
        summary: parsed.summary,
        contextReferences: parsed.contextReferences.filter((reference): reference is ActionContextReference =>
          typeof reference === "object" &&
          reference !== null &&
          "documentId" in reference &&
          typeof reference.documentId === "string" &&
          "purpose" in reference &&
          isActionContextPurpose(reference.purpose) &&
          "title" in reference &&
          typeof reference.title === "string" &&
          "sha256" in reference &&
          typeof reference.sha256 === "string",
        ),
      };
    }
  } catch {
    return { summary: value, contextReferences: [] };
  }
  return { summary: value, contextReferences: [] };
}
