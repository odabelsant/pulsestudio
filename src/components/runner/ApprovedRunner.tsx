"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";

type RunnerJob = "lint" | "build" | "playwright";

type WorkspaceStatus = {
  workspace: string;
  ready: boolean;
  configured: boolean;
};

type RunResult = {
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

const JOBS: { id: RunnerJob; label: string; description: string }[] = [
  { id: "lint", label: "Ejecutar lint", description: "Comprueba estilo y tipos del proyecto objetivo." },
  { id: "build", label: "Ejecutar build", description: "Compila el proyecto objetivo." },
  { id: "playwright", label: "Ejecutar Playwright", description: "Ejecuta la suite o un test especificado." },
];

export default function ApprovedRunner({ onDiagnose }: { onDiagnose: (output: string) => void }) {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [testPath, setTestPath] = useState("");
  const [running, setRunning] = useState<RunnerJob | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/runner")
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo consultar el workspace.");
        return response.json() as Promise<WorkspaceStatus>;
      })
      .then(setStatus)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No se pudo consultar el workspace."));
  }, []);

  async function run(job: RunnerJob) {
    setRunning(job);
    setError(null);
    setResult(null);
    try {
      const selectedPath = job === "playwright" && testPath.trim() ? testPath.trim() : undefined;
      const action = JOBS.find((item) => item.id === job);
      const preview = [
        `Trabajo: ${action?.label ?? job}`,
        `Workspace: ${status?.workspace ?? "desconocido"}`,
        ...(selectedPath ? [`Test: ${selectedPath}`] : []),
      ].join("\n");
      if (!window.confirm(`Revisa y aprueba esta ejecución:\n\n${preview}`)) return;

      const approvalResponse = await apiFetch("/api/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "authorize", job, ...(selectedPath ? { testPath: selectedPath } : {}) }),
      });
      const approval = await approvalResponse.json() as { approvalId?: string; error?: string };
      if (!approvalResponse.ok || !approval.approvalId) {
        throw new Error(approval.error ?? "No se pudo registrar la aprobación.");
      }
      const response = await apiFetch("/api/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          job,
          approvalId: approval.approvalId,
          ...(selectedPath ? { testPath: selectedPath } : {}),
        }),
      });
      const data = await response.json() as RunResult | { error: string };
      if (!response.ok || "error" in data) throw new Error("error" in data ? data.error : "La ejecución falló.");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La ejecución falló.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-950/80 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Runner seguro</h2>
          <p className="text-sm text-slate-400">Sólo ejecuta lint, build y Playwright aprobados; no acepta comandos libres.</p>
        </div>
        <span className={status?.ready ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>
          {status?.ready ? "Workspace listo" : "Workspace pendiente"}
        </span>
      </div>
      <p className="mt-3 break-all text-xs text-slate-500">{status?.workspace || "Cargando workspace…"}</p>
      {!status?.configured && status?.ready && <p className="mt-2 text-xs text-amber-300">Usando la carpeta del Orquestador. Configura TARGET_WORKSPACE_PATH para ejecutar TecnoCosecha.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {JOBS.map((job) => (
          <Button key={job.id} variant="outline" disabled={!status?.ready || Boolean(running)} onClick={() => run(job.id)} name={job.id} title={job.description}>
            {running === job.id ? "Ejecutando…" : job.label}
          </Button>
        ))}
      </div>
      <label className="mt-4 grid gap-1 text-sm text-slate-300">
        Test Playwright opcional
        <input value={testPath} onChange={(event) => setTestPath(event.target.value)} placeholder="e2e/login.spec.ts" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
      </label>
      {error && <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {result && (
        <div className="mt-4 rounded-lg border border-slate-700 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className={result.exitCode === 0 && !result.timedOut && result.status === "COMPLETED" ? "text-emerald-300" : "text-rose-300"}>{result.exitCode === 0 && !result.timedOut && result.status === "COMPLETED" ? "Correcto" : "Requiere revisión"}</span>
            <span className="text-slate-400">{result.command} · {(result.durationMs / 1000).toFixed(1)} s</span>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-3 text-xs text-slate-200">{result.output}</pre>
          {result.exitCode !== 0 && <Button className="mt-3" variant="outline" onClick={() => onDiagnose(result.output)}>Enviar error al Debugger</Button>}
        </div>
      )}
    </section>
  );
}
