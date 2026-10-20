import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ProductivityBoardMetrics {
  updatedAt: string;
  activeEntity: string;
  recordsInEntity: number;
  totalQaRecords: number;
  agentStepsApproved: number;
  agentStepsRejected: number;
  agentStepsPending: number;
  lastTaskLabel: string;
  exportReady: boolean;
}

const DEFAULT_METRICS: ProductivityBoardMetrics = {
  updatedAt: new Date(0).toISOString(),
  activeEntity: "requirements",
  recordsInEntity: 0,
  totalQaRecords: 0,
  agentStepsApproved: 0,
  agentStepsRejected: 0,
  agentStepsPending: 0,
  lastTaskLabel: "Sin tareas activas",
  exportReady: false,
};

function metricsPath() {
  return path.join(process.cwd(), "data", "productivity-metrics.json");
}

function normalizeMetrics(value: unknown): ProductivityBoardMetrics {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_METRICS, updatedAt: new Date().toISOString() };
  const record = value as Record<string, unknown>;
  return {
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    activeEntity: typeof record.activeEntity === "string" ? record.activeEntity : "requirements",
    recordsInEntity: typeof record.recordsInEntity === "number" ? record.recordsInEntity : 0,
    totalQaRecords: typeof record.totalQaRecords === "number" ? record.totalQaRecords : 0,
    agentStepsApproved: typeof record.agentStepsApproved === "number" ? record.agentStepsApproved : 0,
    agentStepsRejected: typeof record.agentStepsRejected === "number" ? record.agentStepsRejected : 0,
    agentStepsPending: typeof record.agentStepsPending === "number" ? record.agentStepsPending : 0,
    lastTaskLabel: typeof record.lastTaskLabel === "string" ? record.lastTaskLabel : "Sin tareas activas",
    exportReady: record.exportReady === true,
  };
}

export async function readProductivityMetrics(): Promise<ProductivityBoardMetrics> {
  try {
    const raw = await readFile(metricsPath(), "utf8");
    return normalizeMetrics(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_METRICS, updatedAt: new Date().toISOString() };
  }
}

export async function writeProductivityMetrics(
  patch: Partial<ProductivityBoardMetrics>,
): Promise<ProductivityBoardMetrics> {
  const current = await readProductivityMetrics();
  const next: ProductivityBoardMetrics = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(metricsPath()), { recursive: true });
  await writeFile(metricsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
