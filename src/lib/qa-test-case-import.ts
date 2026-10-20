import type { ActionAuthorizationInput } from "./action-authorization.ts";
import {
  normalizeQaContextReferences,
  normalizeTestCaseInput,
  QaValidationError,
} from "./qa-domain.ts";
import type { ActionContextReference } from "../types/action-context.ts";

export interface QaTestCaseImportPayload {
  cases: ReturnType<typeof normalizeTestCaseInput>[];
  contextReferences: ReturnType<typeof normalizeQaContextReferences>;
  contextNotebookId: string | null;
  sourceActionLogId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeQaTestCaseImport(value: unknown): QaTestCaseImportPayload {
  if (!isRecord(value) || !Array.isArray(value.cases) || value.cases.length === 0 || value.cases.length > 12) {
    throw new QaValidationError("La importación debe incluir entre 1 y 12 casos válidos.");
  }
  const contextReferences = normalizeQaContextReferences(value.contextReferences);
  const contextNotebookId =
    typeof value.contextNotebookId === "string" && value.contextNotebookId.trim()
      ? value.contextNotebookId.trim()
      : null;
  if (contextReferences.length > 0 && !contextNotebookId) {
    throw new QaValidationError("Las fuentes de contexto requieren el cuaderno activo.");
  }
  if (contextReferences.length === 0 && contextNotebookId) {
    throw new QaValidationError("No se admite un cuaderno sin fuentes de contexto asociadas.");
  }
  if (typeof value.sourceActionLogId !== "string" || !value.sourceActionLogId.trim()) {
    throw new QaValidationError("Se requiere el registro de generación del Action Agent.");
  }
  const cases = value.cases.map((testCase) => normalizeTestCaseInput(testCase));
  return {
    cases,
    contextReferences,
    contextNotebookId,
    sourceActionLogId: value.sourceActionLogId.trim(),
  };
}

export function qaTestCaseImportAuthorization(
  payload: QaTestCaseImportPayload,
): ActionAuthorizationInput {
  return {
    operation: "qa.testcase.persist-approved",
    target: "local-qa",
    payload,
  };
}

export function matchesQaTestCaseSource(
  sourceCasesJson: string,
  sourceContextReferences: ActionContextReference[],
  payload: QaTestCaseImportPayload,
): boolean {
  try {
    const sourceCases: unknown = JSON.parse(sourceCasesJson);
    if (!Array.isArray(sourceCases)) return false;
    const normalizedSourceCases = sourceCases.map((testCase) => normalizeTestCaseInput(testCase));
    return JSON.stringify(normalizedSourceCases) === JSON.stringify(payload.cases) &&
      JSON.stringify(sourceContextReferences) === JSON.stringify(payload.contextReferences);
  } catch {
    return false;
  }
}
