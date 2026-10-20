import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { activeProjectProfile } from "@/lib/project-profiles";
import { prisma } from "@/lib/prisma";
import { redactSecretsFromText } from "@/lib/secret-redaction";
import {
  consumeActionApproval,
  createActionApproval,
  finishActionApproval,
} from "@/lib/action-authorization-store";
import type { ActionAuthorizationInput } from "@/lib/action-authorization";

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
  executionId: string;
  approvalId: string;
  job: RunnerJob;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  status: "COMPLETED" | "FAILED" | "UNKNOWN";
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

function runnerAuthorization(job: RunnerJob, workspace: string, testPath?: string): ActionAuthorizationInput {
  const { bin, args } = commandFor(job, testPath);
  return {
    operation: "runner.execute",
    target: path.resolve(workspace),
    payload: { job, testPath: testPath ?? null, command: [bin, ...args] },
  };
}

export async function authorizeRunnerJob(job: RunnerJob, testPath?: string) {
  const status = await workspaceStatus();
  if (!status.ready) throw new Error("TARGET_WORKSPACE_PATH does not point to a readable project folder.");
  const normalizedTestPath = job === "playwright" ? validateTestPath(testPath) : undefined;
  return createActionApproval(runnerAuthorization(job, status.workspace, normalizedTestPath));
}

export function redactRunnerOutput(value: string): string {
  const secrets = Object.entries(process.env)
    .filter(([key, secret]) =>
      /secret|token|password|credential|authorization|cookie|jwt|private|service[_-]?account|pat|api[_-]?key|(?:^|[_-])key(?:$|[_-])/i.test(key) &&
      Boolean(secret) &&
      secret!.length >= 4)
    .map(([, secret]) => secret!);
  return redactSecretsFromText(value, secrets);
}

export async function runApprovedJob(
  job: RunnerJob,
  testPath: string | undefined,
  approvalId: string,
): Promise<RunResult> {
  if (!approvalId) throw new Error("Se requiere una aprobación del servidor para ejecutar este trabajo.");
  const status = await workspaceStatus();
  if (!status.ready) throw new Error("TARGET_WORKSPACE_PATH does not point to a readable project folder.");
  const normalizedTestPath = job === "playwright" ? validateTestPath(testPath) : undefined;
  if (!await consumeActionApproval(
    approvalId,
    runnerAuthorization(job, status.workspace, normalizedTestPath),
  )) {
    throw new Error("La aprobación no existe, expiró, ya se usó o no corresponde exactamente a este trabajo.");
  }

  const { bin, args } = commandFor(job, normalizedTestPath);
  const command = [bin, ...args].join(" ");
  const startedAt = Date.now();
  const executionId = randomUUID();
  try {
    await prisma.runnerExecution.create({
      data: {
        id: executionId,
        job,
        testPath: normalizedTestPath ?? null,
        status: "STARTING",
        command,
        approvalId,
        durationMs: 0,
        startedAt: new Date(startedAt),
        projectProfile: path.resolve(status.workspace),
      },
      select: { id: true },
    });
  } catch {
    await finishActionApproval(approvalId, {
      status: "FAILED",
      error: "No se pudo crear el registro de ejecución.",
    });
    throw new Error("No se pudo registrar la ejecución autorizada; el trabajo no se inició.");
  }

  return new Promise<RunResult>((resolve, reject) => {
    let output = "";
    let timedOut = false;
    let settled = false;
    let auditWriteFailed = false;
    let auditStateUpdate = Promise.resolve();
    let activeChild: ReturnType<typeof spawn> | undefined;
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-MAX_OUTPUT_LENGTH);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      activeChild?.kill("SIGTERM");
    }, TIMEOUTS[job]);
    try {
      activeChild = spawn(bin, args, {
        cwd: path.resolve(status.workspace),
        shell: false,
        env: process.env,
      });
    } catch {
      void settleSpawnFailure();
      return;
    }
    const child = activeChild;
    if (!child?.stdout || !child.stderr) {
      child?.kill("SIGTERM");
      void settleSpawnFailure();
      return;
    }
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("spawn", () => {
      auditStateUpdate = auditStateUpdate.then(async () => {
        try {
          await prisma.runnerExecution.update({
            where: { id: executionId },
            data: { status: "RUNNING" },
          });
        } catch {
          auditWriteFailed = true;
          child.kill("SIGTERM");
        }
      });
    });
    child.once("error", () => {
      void settleSpawnFailure();
    });
    child.once("close", async (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await auditStateUpdate;
      const durationMs = Date.now() - startedAt;
      const safeOutput = redactRunnerOutput(output || "No output returned.");
      const resultStatus = timedOut
        ? "FAILED"
        : exitCode === 0
          ? "COMPLETED"
          : exitCode === null
            ? "UNKNOWN"
            : "FAILED";
      const error = auditWriteFailed
        ? "No se pudo actualizar el registro de ejecución."
        : resultStatus === "COMPLETED"
          ? null
          : timedOut
            ? "El trabajo excedió el tiempo límite."
            : signal
              ? `El proceso terminó con la señal ${signal}.`
              : exitCode === null
                ? "El proceso terminó sin un código de salida verificable."
                : `El proceso terminó con código ${exitCode}.`;
      try {
        await prisma.runnerExecution.update({
          where: { id: executionId },
          data: {
            status: auditWriteFailed ? "UNKNOWN" : resultStatus,
            output: safeOutput,
            exitCode,
            timedOut,
            error,
            durationMs,
            completedAt: new Date(),
          },
        });
        const approvalFinalized = await finishActionApproval(approvalId, {
          status: auditWriteFailed || resultStatus === "UNKNOWN"
            ? "UNKNOWN"
            : resultStatus,
          summary: resultStatus === "COMPLETED" && !auditWriteFailed
            ? "El proceso terminó con código 0."
            : undefined,
          error: error ?? undefined,
        });
        if (!approvalFinalized) throw new Error("No se pudo finalizar el registro de aprobación.");
        if (auditWriteFailed) {
          reject(new Error("El resultado del proceso no pudo quedar registrado de forma verificable."));
          return;
        }
      } catch {
        reject(new Error("El proceso terminó, pero no se pudo guardar su resultado de forma verificable."));
        return;
      }
      resolve({
        executionId,
        approvalId,
        job,
        command,
        output: safeOutput,
        exitCode,
        durationMs,
        timedOut,
        status: auditWriteFailed ? "UNKNOWN" : resultStatus,
      });
    });

    async function settleSpawnFailure() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const error = "No se pudo iniciar o mantener el proceso.";
      try {
        await prisma.runnerExecution.update({
          where: { id: executionId },
          data: {
            status: "FAILED",
            error,
            output: redactRunnerOutput(output),
            durationMs: Date.now() - startedAt,
            completedAt: new Date(),
          },
        });
        if (!await finishActionApproval(approvalId, { status: "FAILED", error })) {
          throw new Error("No se pudo finalizar la aprobación.");
        }
      } catch {
        reject(new Error("No se pudo iniciar el Runner ni confirmar de forma segura el resultado."));
        return;
      }
      reject(new Error("No se pudo iniciar el trabajo del Runner."));
    }
  });
}

export async function getExecutionHistory(): Promise<ExecutionHistoryEntry[]> {
  const executions = await prisma.runnerExecution.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    select: { id: true, job: true, output: true, exitCode: true, timedOut: true, status: true },
  });
  return executions.map((execution) => ({
    id: execution.id,
    title: `${execution.job} · ${execution.status}`,
    output: execution.output ?? "",
    exitCode: execution.exitCode,
    timedOut: execution.timedOut,
  }));
}

type ExecutionHistoryEntry = {
  id: string;
  title: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
};
