import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { activeProjectProfile } from "@/lib/project-profiles";

export const RUNNER_JOBS = ["lint", "build", "playwright", "typecheck", "prisma"] as const;
export type RunnerJob = (typeof RUNNER_JOBS)[number];

const MAX_OUTPUT_LENGTH = 120_000;
const TIMEOUTS: Record<RunnerJob, number> = {
  lint: 2 * 60_000,
  build: 5 * 60_000,
  playwright: 10 * 60_000,
  typecheck: 2 * 60_000,
  prisma: 2 * 60_000,
};

export type RunResult = {
  job: RunnerJob;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
};

export function configuredWorkspace() {
  return activeProjectProfile().workspace;
}

export async function workspaceStatus() {
  const workspace = configuredWorkspace();
  try {
    const info = await fs.stat(workspace);
    return { workspace, ready: info.isDirectory(), configured: workspace !== process.cwd() };
  } catch {
    return { workspace, ready: false, configured: workspace !== process.cwd() };
  }
}

function commandFor(job: RunnerJob, testPath?: string) {
  if (job === "lint") return { bin: "npm", args: ["run", "lint"] };
  if (job === "build") return { bin: "npm", args: ["run", "build"] };
  if (job === "typecheck") return { bin: "npx", args: ["tsc", "--noEmit"] };
  if (job === "prisma") return { bin: "npx", args: ["prisma", "generate"] };
  const safeTestPath = validateTestPath(testPath);
  return { bin: "npx", args: ["playwright", "test", ...(safeTestPath ? [safeTestPath] : [])] };
}

function validateTestPath(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === "..") ||
    !/^[a-zA-Z0-9_./-]+\.(spec|test)\.[cm]?[jt]sx?$/.test(normalized)
  ) {
    throw new Error("The Playwright path must be a relative *.spec.* or *.test.* file inside the workspace.");
  }
  return normalized;
}

export async function runApprovedJob(job: RunnerJob, testPath?: string): Promise<RunResult> {
  const status = await workspaceStatus();
  if (!status.ready) throw new Error("TARGET_WORKSPACE_PATH does not point to a readable project folder.");
  const { bin, args } = commandFor(job, testPath);
  const command = [bin, ...args].join(" ");
  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: path.resolve(status.workspace), shell: false, env: process.env });
    let output = "";
    let timedOut = false;
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-MAX_OUTPUT_LENGTH);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, TIMEOUTS[job]);

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        job,
        command,
        output: output || "No output returned.",
        exitCode,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}

/**
 * Obtiene el historial de ejecuciones de tests Playwright
 * 
 * @returns Array de objetos de ejecución con ID, título y output
 */
export async function getExecutionHistory(): Promise<ExecutionHistoryEntry[]> {
  // Esta función debería obtener el historial de ejecuciones recientes
  // En un setup completo, esto vendría de la base de datos o cache de Playwright
  // Para ahora, retornamos un array vacío para que el bug-reporter funcione
  return [];
}

type ExecutionHistoryEntry = {
  id: string;
  title: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}
