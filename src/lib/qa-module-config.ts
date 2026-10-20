import type { QaEntity } from "@/lib/qa-domain";

export type QaField = {
  key: string;
  label: string;
  kind?: "textarea" | "list" | "json" | "date" | "select";
  options?: string[];
  required?: boolean;
};

export type QaRecord = Record<string, unknown> & { id: string };

export const QA_MODULE_CONFIG: Record<QaEntity, { title: string; description: string; fields: QaField[] }> = {
  requirements: {
    title: "Requirements",
    description: "Gestiona requisitos locales y vincúlalos con los casos de prueba.",
    fields: [
      { key: "key", label: "Clave local", required: false },
      { key: "title", label: "Título", required: true },
      { key: "description", label: "Descripción", kind: "textarea" },
      { key: "acceptanceCriteria", label: "Criterios de aceptación (uno por línea)", kind: "list" },
      { key: "status", label: "Estado", kind: "select", options: ["DRAFT", "ACTIVE", "BLOCKED", "DONE"] },
      { key: "externalProvider", label: "Proveedor externo (solo referencia)", kind: "select", options: ["", "azure-devops", "jira"] },
      { key: "externalId", label: "ID externo (solo referencia)" },
    ],
  },
  "test-cases": {
    title: "Test Cases",
    description: "Administra casos locales. Los casos creados por Action Agent requieren aprobación ligada al contenido antes de persistirse.",
    fields: [
      { key: "title", label: "Título", required: true },
      { key: "description", label: "Descripción", kind: "textarea" },
      { key: "category", label: "Categoría", kind: "select", options: ["manual", "automated", "performance", "api", "sql", "positive", "negative"] },
      { key: "gherkin", label: "Escenario Gherkin", kind: "textarea", required: true },
      { key: "steps", label: "Pasos JSON (step, expectedResult)", kind: "json", required: true },
      { key: "requirementIds", label: "IDs de Requirements (separados por coma)", kind: "list" },
      { key: "status", label: "Estado", kind: "select", options: ["DRAFT", "READY", "ARCHIVED"] },
    ],
  },
  "test-plans": {
    title: "Test Plans",
    description: "Organiza ciclos locales de validación y sus suites.",
    fields: [
      { key: "name", label: "Nombre", required: true },
      { key: "description", label: "Descripción", kind: "textarea" },
      { key: "status", label: "Estado", kind: "select", options: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] },
      { key: "startsAt", label: "Fecha de inicio", kind: "date" },
      { key: "endsAt", label: "Fecha de fin", kind: "date" },
      { key: "suiteIds", label: "IDs de suites (separados por coma)", kind: "list" },
    ],
  },
  "test-suites": {
    title: "Test Suites",
    description: "Agrupa casos de prueba y vincula suites con planes locales.",
    fields: [
      { key: "name", label: "Nombre", required: true },
      { key: "description", label: "Descripción", kind: "textarea" },
      { key: "status", label: "Estado", kind: "select", options: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] },
      { key: "planIds", label: "IDs de planes (separados por coma)", kind: "list" },
      { key: "testCaseIds", label: "IDs de casos (separados por coma)", kind: "list" },
    ],
  },
  bugs: {
    title: "Bugs",
    description: "Registra defectos locales y enlaza evidencia con casos o ejecuciones del Runner.",
    fields: [
      { key: "title", label: "Título", required: true },
      { key: "description", label: "Descripción", kind: "textarea" },
      { key: "severity", label: "Severidad", kind: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { key: "status", label: "Estado", kind: "select", options: ["OPEN", "TRIAGED", "FIXED", "CLOSED"] },
      { key: "stepsToReproduce", label: "Pasos para reproducir (uno por línea)", kind: "list" },
      { key: "expected", label: "Resultado esperado", kind: "textarea" },
      { key: "observed", label: "Resultado observado", kind: "textarea" },
      { key: "testCaseId", label: "ID de Test Case vinculado" },
      { key: "runnerExecutionId", label: "ID de Runner Execution vinculado" },
    ],
  },
};

export const QA_ENTITY_OPTIONS: { id: QaEntity; label: string }[] = [
  { id: "requirements", label: "Requirements" },
  { id: "test-cases", label: "Test Cases" },
  { id: "test-plans", label: "Test Plans" },
  { id: "test-suites", label: "Test Suites" },
  { id: "bugs", label: "Bugs" },
];

export function qaEntityFromModuleSlug(slug: string): QaEntity | null {
  const map: Record<string, QaEntity> = {
    requirements: "requirements",
    "test-cases": "test-cases",
    "test-plans": "test-plans",
    "test-suites": "test-suites",
    bugs: "bugs",
  };
  return map[slug] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyQaForm(entity: QaEntity): Record<string, string> {
  return Object.fromEntries(QA_MODULE_CONFIG[entity].fields.map((field) => {
    if (field.key === "status") return [field.key, entity === "bugs" ? "OPEN" : "DRAFT"];
    if (field.key === "category") return [field.key, "manual"];
    if (field.key === "severity") return [field.key, "MEDIUM"];
    if (field.key === "steps") return [field.key, '[{"step":"Paso 1","expectedResult":"Resultado esperado"}]'];
    return [field.key, ""];
  }));
}

function arrayToText(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join("\n");
  if (typeof value !== "string") return "";
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").join("\n") : "";
  } catch {
    return "";
  }
}

export function qaRecordToForm(entity: QaEntity, record: QaRecord): Record<string, string> {
  const result = emptyQaForm(entity);
  for (const field of QA_MODULE_CONFIG[entity].fields) {
    const value = record[field.key];
    if (field.kind === "list") {
      if (field.key === "requirementIds" && Array.isArray(record.requirements)) {
        result[field.key] = record.requirements
          .flatMap((entry) => isRecord(entry) && typeof entry.requirementId === "string" ? [entry.requirementId] : [])
          .join(", ");
      } else if (field.key === "suiteIds" && Array.isArray(record.suites)) {
        result[field.key] = record.suites
          .flatMap((entry) => isRecord(entry) && typeof entry.testSuiteId === "string" ? [entry.testSuiteId] : [])
          .join(", ");
      } else if (field.key === "planIds" && Array.isArray(record.plans)) {
        result[field.key] = record.plans
          .flatMap((entry) => isRecord(entry) && typeof entry.testPlanId === "string" ? [entry.testPlanId] : [])
          .join(", ");
      } else if (field.key === "testCaseIds" && Array.isArray(record.testCases)) {
        result[field.key] = record.testCases
          .flatMap((entry) => isRecord(entry) && typeof entry.testCaseId === "string" ? [entry.testCaseId] : [])
          .join(", ");
      } else {
        result[field.key] = arrayToText(value);
      }
    } else if (field.kind === "json") {
      try {
        result[field.key] = JSON.stringify(JSON.parse(typeof value === "string" ? value : "[]"), null, 2);
      } catch {
        result[field.key] = "[]";
      }
    } else if (field.kind === "date" && typeof value === "string") {
      result[field.key] = value.slice(0, 10);
    } else if (typeof value === "string") {
      result[field.key] = value;
    }
  }
  if (entity === "test-cases" && record.status === "APPROVED") {
    result.status = "DRAFT";
  }
  return result;
}

export function qaFormToPayload(entity: QaEntity, form: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...form };
  for (const field of QA_MODULE_CONFIG[entity].fields) {
    if (field.kind === "list") {
      payload[field.key] = form[field.key]
        .split(field.key.endsWith("Ids") ? "," : "\n")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (field.kind === "json") {
      try {
        payload[field.key] = JSON.parse(form[field.key]);
      } catch {
        throw new Error("Los pasos deben ser JSON válido.");
      }
    }
    if (field.kind === "date" && form[field.key]) {
      payload[field.key] = new Date(`${form[field.key]}T00:00:00.000Z`).toISOString();
    }
    if (field.key === "externalProvider" && form[field.key] === "") {
      payload[field.key] = null;
    }
    if ((field.key === "externalId" || field.key === "testCaseId" || field.key === "runnerExecutionId") && !form[field.key]?.trim()) {
      payload[field.key] = null;
    }
  }
  return payload;
}

export function qaRecordSummary(entity: QaEntity, record: QaRecord): string {
  const primary = typeof record.title === "string" ? record.title : record.name;
  return typeof primary === "string" ? primary : record.id;
}

export function parseStoredContext(value: unknown): unknown {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
