import type { ActionContextReference } from "../types/action-context.ts";

export const QA_ENTITIES = [
  "requirements",
  "test-cases",
  "test-plans",
  "test-suites",
  "bugs",
] as const;

export type QaEntity = (typeof QA_ENTITIES)[number];

export class QaValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface TestStepInput {
  step: string;
  expectedResult: string;
}

export interface RequirementInput {
  key: string | null;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: "DRAFT" | "ACTIVE" | "BLOCKED" | "DONE";
  externalProvider: "azure-devops" | "jira" | null;
  externalId: string | null;
}

export interface TestCaseInput {
  title: string;
  description: string;
  category: "manual" | "automated" | "performance" | "api" | "sql" | "positive" | "negative";
  gherkin: string;
  steps: TestStepInput[];
  requirementIds: string[];
}

export interface TestPlanInput {
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startsAt: Date | null;
  endsAt: Date | null;
  suiteIds: string[];
}

export interface TestSuiteInput {
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  planIds: string[];
  testCaseIds: string[];
}

export interface BugInput {
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "TRIAGED" | "FIXED" | "CLOSED";
  stepsToReproduce: string[];
  expected: string;
  observed: string;
  testCaseId: string | null;
  runnerExecutionId: string | null;
}

function requiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new QaValidationError(`${name} debe ser texto no vacío de hasta ${maxLength} caracteres.`);
  }
  return value.trim();
}

function optionalText(value: unknown, name: string, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > maxLength) {
    throw new QaValidationError(`${name} debe ser texto de hasta ${maxLength} caracteres.`);
  }
  return value.trim();
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  fallback: T[number],
  name: string,
): T[number] {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new QaValidationError(`${name} no es válido.`);
  }
  return value as T[number];
}

function textList(value: unknown, name: string, maxItems: number, maxLength: number): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some((item) => typeof item !== "string" || !item.trim() || item.length > maxLength)
  ) {
    throw new QaValidationError(`${name} debe ser una lista de hasta ${maxItems} textos válidos.`);
  }
  return value.map((item) => (item as string).trim());
}

export function normalizeIdList(value: unknown, name: string, maxItems = 100): string[] {
  const ids = textList(value, name, maxItems, 200);
  if (new Set(ids).size !== ids.length) {
    throw new QaValidationError(`${name} no puede contener identificadores duplicados.`);
  }
  return ids;
}

export function normalizeQaContextReferences(value: unknown): ActionContextReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) {
    throw new QaValidationError("Selecciona como máximo cuatro referencias de contexto.");
  }
  const ids = new Set<string>();
  return value.map((reference) => {
    if (
      !isRecord(reference) ||
      typeof reference.documentId !== "string" ||
      !reference.documentId.trim() ||
      reference.documentId.length > 200 ||
      ids.has(reference.documentId) ||
      (reference.purpose !== "procedure" && reference.purpose !== "work-data") ||
      typeof reference.title !== "string" ||
      !reference.title.trim() ||
      reference.title.length > 240 ||
      typeof reference.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(reference.sha256)
    ) {
      throw new QaValidationError("Una referencia al contexto de acción no es válida.");
    }
    ids.add(reference.documentId);
    return {
      documentId: reference.documentId,
      purpose: reference.purpose,
      title: reference.title.trim(),
      sha256: reference.sha256.toLowerCase(),
    };
  });
}

export function normalizeRequirementInput(value: unknown): RequirementInput {
  if (!isRecord(value)) throw new QaValidationError("El requisito debe ser un objeto.");
  const suppliedProvider =
    value.externalProvider === undefined || value.externalProvider === null || value.externalProvider === ""
      ? null
      : enumValue(value.externalProvider, ["azure-devops", "jira"] as const, "azure-devops", "externalProvider");
  const externalId = optionalText(value.externalId, "externalId", 200) || null;
  if (externalId && !suppliedProvider) {
    throw new QaValidationError("Un ID externo requiere indicar su proveedor.");
  }
  return {
    key: optionalText(value.key, "key", 80) || null,
    title: requiredText(value.title, "title", 240),
    description: optionalText(value.description, "description", 8_000),
    acceptanceCriteria: textList(value.acceptanceCriteria, "acceptanceCriteria", 50, 2_000),
    status: enumValue(value.status, ["DRAFT", "ACTIVE", "BLOCKED", "DONE"] as const, "DRAFT", "status"),
    externalProvider: suppliedProvider,
    externalId,
  };
}

export function normalizeTestCaseInput(value: unknown): TestCaseInput {
  if (!isRecord(value)) throw new QaValidationError("El caso de prueba debe ser un objeto.");
  const category = enumValue(
    value.category,
    ["manual", "automated", "performance", "api", "sql", "positive", "negative"] as const,
    "manual",
    "category",
  );
  const rawSteps = value.steps;
  if (
    !Array.isArray(rawSteps) ||
    rawSteps.length === 0 ||
    rawSteps.length > 50 ||
    rawSteps.some((item) => !isRecord(item))
  ) {
    throw new QaValidationError("steps debe contener entre 1 y 50 pasos.");
  }
  const steps = rawSteps.map((item) => ({
    step: requiredText(item.step, "step", 2_000),
    expectedResult: requiredText(item.expectedResult, "expectedResult", 2_000),
  }));
  return {
    title: requiredText(value.title, "title", 240),
    description: optionalText(value.description, "description", 8_000),
    category,
    gherkin: requiredText(value.gherkin, "gherkin", 8_000),
    steps,
    requirementIds: normalizeIdList(value.requirementIds, "requirementIds"),
  };
}

function optionalDate(value: unknown, name: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new QaValidationError(`${name} debe ser una fecha ISO válida.`);
  }
  return new Date(value);
}

export function normalizeTestPlanInput(value: unknown): TestPlanInput {
  if (!isRecord(value)) throw new QaValidationError("El plan de pruebas debe ser un objeto.");
  const startsAt = optionalDate(value.startsAt, "startsAt");
  const endsAt = optionalDate(value.endsAt, "endsAt");
  if (startsAt && endsAt && startsAt > endsAt) {
    throw new QaValidationError("startsAt no puede ser posterior a endsAt.");
  }
  return {
    name: requiredText(value.name, "name", 240),
    description: optionalText(value.description, "description", 8_000),
    status: enumValue(value.status, ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const, "DRAFT", "status"),
    startsAt,
    endsAt,
    suiteIds: normalizeIdList(value.suiteIds, "suiteIds"),
  };
}

export function normalizeTestSuiteInput(value: unknown): TestSuiteInput {
  if (!isRecord(value)) throw new QaValidationError("La suite de pruebas debe ser un objeto.");
  return {
    name: requiredText(value.name, "name", 240),
    description: optionalText(value.description, "description", 8_000),
    status: enumValue(value.status, ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const, "DRAFT", "status"),
    planIds: normalizeIdList(value.planIds, "planIds"),
    testCaseIds: normalizeIdList(value.testCaseIds, "testCaseIds"),
  };
}

export function normalizeBugInput(value: unknown): BugInput {
  if (!isRecord(value)) throw new QaValidationError("El defecto debe ser un objeto.");
  return {
    title: requiredText(value.title, "title", 240),
    description: optionalText(value.description, "description", 8_000),
    severity: enumValue(value.severity, ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const, "MEDIUM", "severity"),
    status: enumValue(value.status, ["OPEN", "TRIAGED", "FIXED", "CLOSED"] as const, "OPEN", "status"),
    stepsToReproduce: textList(value.stepsToReproduce, "stepsToReproduce", 50, 2_000),
    expected: optionalText(value.expected, "expected", 4_000),
    observed: optionalText(value.observed, "observed", 4_000),
    testCaseId: optionalText(value.testCaseId, "testCaseId", 200) || null,
    runnerExecutionId: optionalText(value.runnerExecutionId, "runnerExecutionId", 200) || null,
  };
}
