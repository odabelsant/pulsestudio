"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, FileCode2, FolderTree, LoaderCircle, Play, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";

type RunnerJob = "lint" | "build" | "playwright" | "typecheck" | "prisma";

interface WorkspaceFileList {
  workspace: string;
  files: string[];
  truncated: boolean;
}

interface RunResult {
  job: RunnerJob;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

const RUNNER_JOBS: { id: RunnerJob; label: string }[] = [
  { id: "playwright", label: "Playwright" },
  { id: "typecheck", label: "TypeScript" },
  { id: "lint", label: "Lint" },
  { id: "build", label: "Build" },
  { id: "prisma", label: "Prisma generate" },
];

export default function WorkspaceIDE() {
  const [workspace, setWorkspace] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [job, setJob] = useState<RunnerJob>("playwright");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedPathRef = useRef("");
  const fileRequestRef = useRef(0);
  const dirty = content !== savedContent;

  const refreshFiles = useCallback(async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const response = await apiFetch("/api/workspace", { cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !isWorkspaceFileList(data)) {
        throw new Error(getErrorMessage(data, "No se pudo cargar el explorador del workspace."));
      }
      setWorkspace(data.workspace);
      setFiles(data.files);
      setTruncated(data.truncated);
      if (selectedPathRef.current && !data.files.includes(selectedPathRef.current)) {
        selectedPathRef.current = "";
        setSelectedPath("");
        setContent("");
        setSavedContent("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el explorador del workspace.");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refreshFiles(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshFiles]);

  async function openFile(filePath: string) {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos y abrir otro archivo?")) return;
    const requestId = ++fileRequestRef.current;
    selectedPathRef.current = filePath;
    setSelectedPath(filePath);
    setContent("");
    setSavedContent("");
    setLoadingFile(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/workspace?path=${encodeURIComponent(filePath)}`, { cache: "no-store" });
      const data: unknown = await response.json();
      if (requestId !== fileRequestRef.current) return;
      if (!response.ok || !isWorkspaceFile(data)) {
        throw new Error(getErrorMessage(data, "No se pudo abrir el archivo."));
      }
      selectedPathRef.current = data.path;
      setSelectedPath(data.path);
      setContent(data.content);
      setSavedContent(data.content);
    } catch (cause) {
      if (requestId !== fileRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el archivo.");
    } finally {
      if (requestId === fileRequestRef.current) setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!selectedPath || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath, content }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !isRecord(data) || data.saved !== true) {
        throw new Error(getErrorMessage(data, "No se pudo guardar el archivo."));
      }
      setSavedContent(content);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el archivo.");
    } finally {
      setSaving(false);
    }
  }

  async function runSelectedJob() {
    if (dirty) {
      setError("Guarda los cambios del archivo antes de ejecutarlo con el Runner.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    const testPath = job === "playwright" && selectedPath && /\.(spec|test)\.[cm]?[jt]sx?$/.test(selectedPath)
      ? selectedPath
      : undefined;
    if (!window.confirm(`Revisa y aprueba esta ejecución:\n\nTrabajo: ${job}\nWorkspace: ${workspace}${testPath ? `\nTest: ${testPath}` : ""}`)) {
      setRunning(false);
      return;
    }
    try {
      const approvalResponse = await apiFetch("/api/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "authorize",
          job,
          ...(testPath ? { testPath } : {}),
        }),
      });
      const approvalBody: unknown = await approvalResponse.json();
      if (!approvalResponse.ok || !isRecord(approvalBody) || typeof approvalBody.approvalId !== "string") {
        throw new Error(getErrorMessage(approvalBody, "No se pudo registrar la aprobación."));
      }
      const response = await apiFetch("/api/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          job,
          approvalId: approvalBody.approvalId,
          ...(testPath ? { testPath } : {}),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !isRunResult(data)) {
        throw new Error(getErrorMessage(data, "El Runner no pudo completar el trabajo."));
      }
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "El Runner no pudo completar el trabajo.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="flex min-h-[min(720px,calc(100vh-8rem))] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileCode2 className="h-4 w-4 text-blue-300" /> Workspace IDE
          </h2>
          <p className="mt-1 truncate text-[11px] text-zinc-500" title={workspace}>
            {workspace || "Cargando workspace…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="workspace-ide-runner-job">Trabajo del Runner</label>
          <select
            id="workspace-ide-runner-job"
            value={job}
            onChange={(event) => setJob(event.target.value as RunnerJob)}
            className="h-9 rounded-lg border border-white/[0.1] bg-[#101012] px-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
          >
            {RUNNER_JOBS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => void runSelectedJob()} disabled={running || dirty}>
            {running ? <LoaderCircle className="animate-spin" /> : <Play />}
            {running ? "Ejecutando…" : "Ejecutar"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void saveFile()} disabled={!dirty || saving}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex max-h-56 min-h-0 flex-col border-b border-white/[0.08] md:max-h-none md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <FolderTree className="h-3.5 w-3.5" /> Archivos {files.length ? `(${files.length})` : ""}
            </span>
            <button
              type="button"
              onClick={() => void refreshFiles()}
              disabled={loadingFiles}
              className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-white/[0.06] hover:text-white"
              aria-label="Actualizar lista de archivos"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
            </button>
          </div>
          <nav className="min-h-0 flex-1 overflow-auto p-2" aria-label="Archivos del workspace">
            {loadingFiles && <p className="px-2 py-3 text-xs text-zinc-500">Cargando archivos…</p>}
            {!loadingFiles && files.map((filePath) => (
              <button
                key={filePath}
                type="button"
                onClick={() => void openFile(filePath)}
                title={filePath}
                className={`mb-0.5 flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left text-xs ${
                  selectedPath === filePath
                    ? "bg-blue-500/15 text-blue-200"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{filePath}</span>
              </button>
            ))}
            {!loadingFiles && files.length === 0 && (
              <p className="px-2 py-3 text-xs text-zinc-500">No se encontraron archivos de código o texto editables.</p>
            )}
            {truncated && <p className="px-2 py-2 text-[10px] text-amber-300">Lista limitada a 500 archivos.</p>}
          </nav>
        </aside>

        <div className="flex min-h-[320px] min-w-0 flex-col">
          <div className="flex h-9 items-center justify-between border-b border-white/[0.06] px-3">
            <span className="truncate font-mono text-[11px] text-zinc-400">
              {selectedPath || "Selecciona un archivo"}
              {dirty && <span className="ml-2 text-amber-300">● Sin guardar</span>}
            </span>
            {loadingFile && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-blue-300" />}
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={!selectedPath || loadingFile}
            spellCheck={false}
            aria-label={selectedPath ? `Editor de ${selectedPath}` : "Editor de código"}
            placeholder="Abre un archivo del explorador para revisar o editar su contenido."
            className="min-h-[320px] flex-1 resize-none bg-[#101012] p-4 font-mono text-xs leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {(error || result) && (
        <section className="border-t border-white/[0.08] p-3" aria-label="Resultado de ejecución del Runner">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {result && (
            <div className="rounded-lg border border-white/[0.08] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={result.exitCode === 0 && !result.timedOut ? "text-emerald-300" : "text-rose-300"}>
                  {result.exitCode === 0 && !result.timedOut ? "Ejecución completada" : "La ejecución requiere revisión"}
                </span>
                <span className="text-zinc-500">{result.command} · {(result.durationMs / 1000).toFixed(1)} s</span>
              </div>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-3 text-xs leading-5 text-zinc-300">{result.output}</pre>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function isWorkspaceFileList(value: unknown): value is WorkspaceFileList {
  return isRecord(value) &&
    typeof value.workspace === "string" &&
    Array.isArray(value.files) &&
    value.files.every((file) => typeof file === "string") &&
    typeof value.truncated === "boolean";
}

function isWorkspaceFile(value: unknown): value is { path: string; content: string } {
  return isRecord(value) && typeof value.path === "string" && typeof value.content === "string";
}

function isRunResult(value: unknown): value is RunResult {
  return isRecord(value) &&
    RUNNER_JOBS.some((option) => option.id === value.job) &&
    typeof value.command === "string" &&
    typeof value.output === "string" &&
    (typeof value.exitCode === "number" || value.exitCode === null) &&
    typeof value.durationMs === "number" && Number.isFinite(value.durationMs) &&
    typeof value.timedOut === "boolean";
}
