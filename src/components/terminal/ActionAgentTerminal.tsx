"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  Bot,
  Check,
  Copy,
  Cpu,
  Monitor,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ContextMentionInput, type MentionSource } from "@/components/chat/ChatInterface";

type ActionJob = "lint" | "build" | "typecheck" | "prisma" | "playwright";
type LogType = "input" | "stdout" | "stderr" | "system" | "agent";
type AgentRoleId = "debugger" | "qa" | "arquitecto" | "optimizador";
type AIProvider = "ollama" | "google";

interface ActionAgentTerminalProps {
  onDiagnose?: (output: string) => void;
  notebookId?: string | null;
  provider?: AIProvider;
  model?: string;
}

interface LogLine {
  id: string;
  type: LogType;
  text: string;
  timestamp: string;
}

interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
  createdAt: number;
}

interface ShellInfo {
  shell?: string;
  pid?: number;
  cwd?: string;
}

interface RunnerResult {
  job: ActionJob;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

interface SavedPreferences {
  tabs: TerminalTab[];
  activeTab: string;
  activeAgent: AgentRoleId;
  commandHistory: string[];
}

const STORAGE_KEY = "pulse_terminal_preferences";
const MAX_LOG_LINES = 300;
const INITIAL_TAB: TerminalTab = {
  id: "default",
  name: "Terminal",
  cwd: "/app",
  createdAt: 0,
};

const AGENT_ROLES: { id: AgentRoleId; name: string; description: string }[] = [
  { id: "debugger", name: "Debugger Agent", description: "Diagnóstico" },
  { id: "qa", name: "QA Automation", description: "Playwright" },
  { id: "arquitecto", name: "Arquitecto", description: "Estructura" },
  { id: "optimizador", name: "Optimizador", description: "Rendimiento" },
];

const QUICK_ACTIONS: { id: ActionJob; label: string; command: string }[] = [
  { id: "lint", label: "Lint", command: "npm run lint" },
  { id: "build", label: "Build", command: "npm run build" },
  { id: "typecheck", label: "Typecheck", command: "npx tsc --noEmit" },
  { id: "prisma", label: "Prisma", command: "npx prisma generate" },
  { id: "playwright", label: "Playwright", command: "npx playwright test" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTerminalTab(value: unknown): value is TerminalTab {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.cwd === "string" &&
    typeof value.createdAt === "number"
  );
}

function isAgentRole(value: unknown): value is AgentRoleId {
  return AGENT_ROLES.some((role) => role.id === value);
}

function isRunnerResult(value: unknown): value is RunnerResult {
  return (
    isRecord(value) &&
    QUICK_ACTIONS.some((action) => action.id === value.job) &&
    typeof value.command === "string" &&
    typeof value.output === "string" &&
    (typeof value.exitCode === "number" || value.exitCode === null) &&
    typeof value.durationMs === "number" &&
    typeof value.timedOut === "boolean"
  );
}

function validateTestPath(value: string): string | null {
  const path = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path) return "";
  if (
    path.startsWith("/") ||
    path.split("/").some((part) => part === "..") ||
    !/^[a-zA-Z0-9_./-]+\.(spec|test)\.[cm]?[jt]sx?$/.test(path)
  ) {
    return null;
  }
  return path;
}

export default function ActionAgentTerminal({
  onDiagnose,
  notebookId = null,
  provider = "ollama",
  model = "qwen2.5-coder:3b",
}: ActionAgentTerminalProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([INITIAL_TAB]);
  const [activeTab, setActiveTab] = useState(INITIAL_TAB.id);
  const [activeAgent, setActiveAgent] = useState<AgentRoleId>("qa");
  const [logsByTab, setLogsByTab] = useState<Record<string, LogLine[]>>({});
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [mentionSources, setMentionSources] = useState<MentionSource[]>([]);
  const [sourceNotebookId, setSourceNotebookId] = useState<string | null>(null);
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isElectronActive, setIsElectronActive] = useState(false);
  const [terminalReadyFor, setTerminalReadyFor] = useState<string | null>(null);
  const [shellInfo, setShellInfo] = useState<ShellInfo | null>(null);
  const [workspace, setWorkspace] = useState(INITIAL_TAB.cwd);
  const [isRunning, setIsRunning] = useState(false);
  const [currentJob, setCurrentJob] = useState<ActionJob | null>(null);
  const [playwrightPath, setPlaywrightPath] = useState("");
  const [copied, setCopied] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const activeLogs = useMemo(() => logsByTab[activeTab] ?? [], [activeTab, logsByTab]);
  const terminalReady = terminalReadyFor === activeTab;
  const activeTabInfo = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  const appendLog = useCallback((type: LogType, text: string, tabId = activeTab) => {
    const line: LogLine = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      text,
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogsByTab((previous) => ({
      ...previous,
      [tabId]: [...(previous[tabId] ?? []), line].slice(-MAX_LOG_LINES),
    }));
  }, [activeTab]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const value: unknown = JSON.parse(stored);
          if (!isRecord(value)) throw new Error("Preferencias de terminal inválidas.");

          const restoredTabs = Array.isArray(value.tabs)
            ? value.tabs.filter(isTerminalTab)
            : [];
          const nextTabs = restoredTabs.length > 0 ? restoredTabs : [INITIAL_TAB];
          setTabs(nextTabs);
          setActiveTab(
            typeof value.activeTab === "string" &&
              nextTabs.some((tab) => tab.id === value.activeTab)
              ? value.activeTab
              : nextTabs[0].id,
          );
          if (isAgentRole(value.activeAgent)) setActiveAgent(value.activeAgent);
          if (
            Array.isArray(value.commandHistory) &&
            value.commandHistory.every((entry) => typeof entry === "string")
          ) {
            setCommandHistory(value.commandHistory.slice(-100));
          }
        }
      } catch (error) {
        console.warn("No se pudieron recuperar las preferencias de terminal.", error);
      } finally {
        setPreferencesLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const preferences: SavedPreferences = {
      tabs,
      activeTab,
      activeAgent,
      commandHistory: commandHistory.slice(-100),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn("No se pudieron guardar las preferencias de terminal.", error);
    }
  }, [activeAgent, activeTab, commandHistory, preferencesLoaded, tabs]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsElectronActive(Boolean(window.electronAPI));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/runner", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo consultar el workspace.");
        const result: unknown = await response.json();
        if (
          isRecord(result) &&
          typeof result.workspace === "string" &&
          typeof result.ready === "boolean" &&
          typeof result.configured === "boolean"
        ) {
          setWorkspace(result.workspace);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        appendLog(
          "stderr",
          error instanceof Error ? error.message : "No se pudo consultar el workspace.",
          INITIAL_TAB.id,
        );
      });
    return () => controller.abort();
  }, [appendLog]);

  useEffect(() => {
    if (!notebookId) return;
    const controller = new AbortController();
    fetch(`/api/context?notebookId=${encodeURIComponent(notebookId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || !Array.isArray(result)) {
          const message = isRecord(result) && typeof result.error === "string"
            ? result.error
            : "No se pudieron cargar las fuentes del cuaderno activo.";
          throw new Error(message);
        }
        const sources = result.filter((item): item is MentionSource =>
          isRecord(item) &&
          typeof item.id === "string" &&
          typeof item.moduleName === "string" &&
          typeof item.projectName === "string",
        );
        setMentionSources(sources);
        setSourceNotebookId(notebookId);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        appendLog("stderr", error instanceof Error ? error.message : "No se pudieron cargar las fuentes.");
      });
    return () => controller.abort();
  }, [appendLog, notebookId]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [activeLogs]);

  useEffect(() => {
    if (!isElectronActive) return;
    const api = window.electronAPI;
    if (!api) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let unsubscribeData: (() => void) | undefined;
    let unsubscribeExit: (() => void) | undefined;
    const initializeTerminal = async () => {
      try {
        unsubscribeData = api.onTerminalData((data) => {
          if (!disposed && data) appendLog("stdout", data, activeTab);
        });
        unsubscribeExit = api.onTerminalExit(({ exitCode, signal }) => {
          if (disposed) return;
          setTerminalReadyFor(null);
          appendLog(
            "system",
            `La shell terminó (código ${exitCode}${signal ? `, señal ${signal}` : ""}).`,
            activeTab,
          );
        });

        const info = await api.createTerminal({ cols: 100, rows: 24 });
        if (disposed) return;
        if (info.error || info.success === false) {
          appendLog("stderr", `No se pudo iniciar la shell: ${info.error ?? "error desconocido"}`, activeTab);
          return;
        }

        setShellInfo(info);
        setWorkspace(info.cwd ?? activeTabInfo?.cwd ?? INITIAL_TAB.cwd);
        setTerminalReadyFor(activeTab);

        const output = outputRef.current;
        if (output && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? output.clientWidth;
            const height = entries[0]?.contentRect.height ?? output.clientHeight;
            const cols = Math.max(40, Math.min(180, Math.floor(width / 8)));
            const rows = Math.max(10, Math.min(50, Math.floor(height / 18)));
            api.resizeTerminal(cols, rows);
          });
          resizeObserver.observe(output);
        }
      } catch (error) {
        if (!disposed) {
          appendLog(
            "stderr",
            `Error al inicializar la terminal: ${error instanceof Error ? error.message : "error desconocido"}`,
            activeTab,
          );
        }
      }
    };

    void initializeTerminal();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      unsubscribeData?.();
      unsubscribeExit?.();
      api.killTerminal();
    };
  }, [activeTab, activeTabInfo?.cwd, appendLog, isElectronActive]);

  const runJob = useCallback(async (job: ActionJob, testPath = "") => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (isElectronActive && api) {
      if (!terminalReady) {
        appendLog("stderr", "La terminal nativa todavía no está lista.");
        return;
      }

      const validPath = job === "playwright" ? validateTestPath(testPath) : "";
      if (validPath === null) {
        appendLog("stderr", "La ruta debe ser un archivo Playwright relativo *.spec.* o *.test.*.");
        return;
      }

      const action = QUICK_ACTIONS.find((item) => item.id === job);
      if (!action) return;
      const command = validPath ? `${action.command} ${validPath}` : action.command;
      appendLog("input", command);
      api.writeTerminal(`${command}\r`);
      return;
    }

    const validPath = job === "playwright" ? validateTestPath(testPath) : "";
    if (validPath === null) {
      appendLog("stderr", "La ruta debe ser un archivo Playwright relativo *.spec.* o *.test.*.");
      return;
    }

    setIsRunning(true);
    setCurrentJob(job);
    const action = QUICK_ACTIONS.find((item) => item.id === job);
    appendLog("system", `Ejecutando acción aprobada: ${action?.label ?? job}…`);

    try {
      const response = await fetch("/api/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          ...(job === "playwright" && validPath ? { testPath: validPath } : {}),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = isRecord(result) && typeof result.error === "string"
          ? result.error
          : `La ejecución de ${job} falló.`;
        throw new Error(message);
      }
      if (!isRunnerResult(result)) {
        throw new Error("El runner devolvió una respuesta con formato inesperado.");
      }

      appendLog("system", `${result.command} · ${(result.durationMs / 1000).toFixed(1)} s`);
      appendLog("stdout", result.output);
      appendLog(
        result.exitCode === 0 && !result.timedOut ? "agent" : "stderr",
        result.exitCode === 0 && !result.timedOut
          ? `${job} terminó correctamente.`
          : `${job} terminó con código ${result.exitCode ?? "desconocido"}${result.timedOut ? " (tiempo agotado)" : ""}.`,
      );
    } catch (error) {
      appendLog(
        "stderr",
        error instanceof Error ? error.message : `No se pudo ejecutar ${job}.`,
      );
    } finally {
      setIsRunning(false);
      setCurrentJob(null);
    }
  }, [appendLog, isElectronActive, terminalReady]);

  const showContext = useCallback(async () => {
    appendLog("system", `Workspace: ${shellInfo?.cwd ?? workspace}`);
    appendLog("agent", `Pestaña: ${activeTabInfo?.name ?? activeTab} · Agente: ${activeAgent}`);
    try {
      const response = await fetch("/api/context");
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = isRecord(result) && typeof result.error === "string"
          ? result.error
          : "No se pudo cargar el contexto del proyecto.";
        throw new Error(message);
      }
      if (!Array.isArray(result)) {
        throw new Error("La respuesta de contexto tiene un formato inesperado.");
      }
      if (result.length === 0) {
        appendLog("system", "No hay documentos de contexto guardados.");
        return;
      }
      appendLog("system", `Documentos de contexto disponibles: ${result.length}`);
      result.slice(0, 10).forEach((document) => {
        if (!isRecord(document)) return;
        const projectName = typeof document.projectName === "string" ? document.projectName : "Proyecto";
        const moduleName = typeof document.moduleName === "string" ? document.moduleName : "Módulo";
        const content = typeof document.markdownContent === "string"
          ? document.markdownContent.trim()
          : "";
        const visibleContent = content.length > 4000
          ? `${content.slice(0, 4000)}\n[Contexto truncado en la vista de terminal.]`
          : content;
        appendLog("system", `• ${projectName} / ${moduleName}${visibleContent ? `\n${visibleContent}` : ""}`);
      });
      if (result.length > 10) {
        appendLog("system", `Se omitieron ${result.length - 10} documentos adicionales.`);
      }
    } catch (error) {
      appendLog(
        "stderr",
        error instanceof Error ? error.message : "No se pudo cargar el contexto del proyecto.",
      );
    }
  }, [activeAgent, activeTab, activeTabInfo?.name, appendLog, shellInfo?.cwd, workspace]);

  const runAgentPrompt = useCallback(async (prompt: string) => {
    setIsRunning(true);
    appendLog("agent", `${activeAgent} · ${prompt}`);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider,
          model,
          agentId: activeAgent,
          skillIds: [],
          ...(notebookId ? { notebookId } : {}),
          documentIds: sourceNotebookId === notebookId
            ? mentionedDocumentIds.filter((id) => mentionSources.some((source) => source.id === id))
            : [],
          history: [],
        }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const message = isRecord(result) && typeof result.error === "string"
          ? result.error
          : "El agente no pudo responder.";
        throw new Error(message);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("La respuesta del agente no incluye contenido.");
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) answer += decoder.decode(value, { stream: true });
      }
      answer += decoder.decode();
      if (!answer.trim()) throw new Error("El agente terminó sin devolver texto.");
      appendLog("agent", answer.trim());
    } catch (error) {
      appendLog("stderr", error instanceof Error ? error.message : "No se pudo completar la solicitud al agente.");
    } finally {
      setIsRunning(false);
    }
  }, [activeAgent, appendLog, mentionSources, mentionedDocumentIds, model, notebookId, provider, sourceNotebookId]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = commandInput.trim();
    if (!command || isRunning) return;

    setCommandHistory((previous) => [...previous.filter((entry) => entry !== command), command].slice(-100));
    setHistoryIndex(null);
    setCommandInput("");
    const selectedMentionIds = mentionedDocumentIds;
    setMentionedDocumentIds([]);
    appendLog("input", command);

    const normalized = command.toLowerCase();
    if (normalized === "/clear" || normalized === "clear" || normalized === "cls") {
      setLogsByTab((previous) => ({ ...previous, [activeTab]: [] }));
      return;
    }
    if (normalized === "/help") {
      [
        "Comandos disponibles:",
        "/clear — limpiar la consola",
        "/help — mostrar esta ayuda",
        "/context — mostrar workspace y contexto guardado",
        "/ask <tarea> — consultar al agente; usa @fuente para añadir una fuente",
        "/git-sync — consultar estado Git en Electron (simulado en web)",
        "/run-tests [ruta] — ejecutar Playwright",
        "Acciones rápidas: lint, build, typecheck, prisma y playwright",
      ].forEach((line) => appendLog("system", line));
      return;
    }
    if (normalized === "/context") {
      void showContext();
      return;
    }
    if (normalized === "/ask" || normalized.startsWith("/ask ")) {
      const prompt = command.slice("/ask".length).trim();
      if (!prompt) {
        appendLog("stderr", "Uso: /ask tarea @fuente");
        return;
      }
      setCommandInput("");
      void runAgentPrompt(prompt);
      return;
    }
    if (normalized === "/git-sync") {
      const api = typeof window !== "undefined" ? window.electronAPI : undefined;
      if (isElectronActive && api && terminalReady) {
        appendLog("system", "Consultando estado Git; no se hará push ni pull automáticamente.");
        appendLog("input", "git status --short --branch");
        api.writeTerminal("git status --short --branch\r");
      } else {
        appendLog(
          "system",
          "Simulación web: no hay acceso a Git desde el navegador; el repositorio no se modificó.",
        );
      }
      return;
    }
    if (normalized === "/run-tests" || normalized.startsWith("/run-tests ")) {
      const testPath = command.slice("/run-tests".length).trim();
      void runJob("playwright", testPath);
      return;
    }
    if (selectedMentionIds.length > 0) {
      appendLog("stderr", "Las menciones de fuentes se inyectan en solicitudes del agente. Usa /ask <tarea> @fuente.");
      return;
    }

    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (isElectronActive && api && terminalReady) {
      api.writeTerminal(`${command}\r`);
      return;
    }
    appendLog(
      "system",
      `Simulación web: el navegador no ejecuta comandos arbitrarios (${command}). Usa /help o una acción rápida aprobada.`,
    );
  }, [
    activeTab,
    appendLog,
    commandInput,
    isElectronActive,
    isRunning,
    runJob,
    runAgentPrompt,
    showContext,
    mentionedDocumentIds,
    terminalReady,
  ]);

  const handleCommandKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHistoryIndex((current) => {
        const next = current === null
          ? commandHistory.length - 1
          : Math.max(0, current - 1);
        if (next >= 0) setCommandInput(commandHistory[next] ?? "");
        return next >= 0 ? next : null;
      });
    } else if (event.key === "ArrowDown" && historyIndex !== null) {
      event.preventDefault();
      const next = historyIndex + 1;
      if (next >= commandHistory.length) {
        setHistoryIndex(null);
        setCommandInput("");
      } else {
        setHistoryIndex(next);
        setCommandInput(commandHistory[next] ?? "");
      }
    }
  }, [commandHistory, historyIndex]);

  const addTab = useCallback(() => {
    const nextNumber = tabs.length + 1;
    const id = `terminal-${Date.now()}`;
    const tab: TerminalTab = {
      id,
      name: `Terminal ${nextNumber}`,
      cwd: workspace,
      createdAt: Date.now(),
    };
    setTabs((previous) => [...previous, tab]);
    setActiveTab(id);
    setLogsByTab((previous) => ({ ...previous, [id]: [] }));
  }, [tabs.length, workspace]);

  const closeTab = useCallback((tabId: string) => {
    if (tabs.length <= 1) {
      appendLog("system", "Debe permanecer al menos una pestaña abierta.", tabId);
      return;
    }
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    const remaining = tabs.filter((tab) => tab.id !== tabId);
    setTabs(remaining);
    setLogsByTab((previous) => {
      const next = { ...previous };
      delete next[tabId];
      return next;
    });
    if (activeTab === tabId) {
      setActiveTab(remaining[Math.max(0, closingIndex - 1)]?.id ?? remaining[0].id);
    }
  }, [activeTab, appendLog, tabs]);

  const clearTerminal = useCallback(() => {
    setLogsByTab((previous) => ({ ...previous, [activeTab]: [] }));
  }, [activeTab]);

  const restartTerminal = useCallback(() => {
    if (isElectronActive) {
      window.electronAPI?.killTerminal();
      setTerminalReadyFor(null);
      const api = window.electronAPI;
      if (!api) return;
      void api.createTerminal({ cols: 100, rows: 24 }).then((info) => {
        if (info.error || info.success === false) {
          appendLog("stderr", `No se pudo reiniciar la shell: ${info.error ?? "error desconocido"}`);
          return;
        }
        setShellInfo(info);
        setTerminalReadyFor(activeTab);
        appendLog("system", "Shell nativa reiniciada.");
      }).catch((error: unknown) => {
        appendLog(
          "stderr",
          `No se pudo reiniciar la shell: ${error instanceof Error ? error.message : "error desconocido"}`,
        );
      });
      return;
    }
    clearTerminal();
    appendLog("system", "Terminal web reiniciada; el historial local se limpió.");
  }, [activeTab, appendLog, clearTerminal, isElectronActive]);

  const copyTerminal = useCallback(async () => {
    const text = activeLogs.map((line) => `[${line.timestamp}] ${line.text}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast({ title: "Consola copiada", description: "El historial se copió al portapapeles." });
    } catch (error) {
      toast({
        title: "No se pudo copiar",
        description: error instanceof Error ? error.message : "El portapapeles no está disponible.",
        variant: "destructive",
      });
    }
  }, [activeLogs, toast]);

  const sendToDebugger = useCallback(() => {
    const output = activeLogs
      .filter((line) => line.type === "stdout" || line.type === "stderr")
      .map((line) => line.text)
      .join("\n");
    if (!output) {
      toast({ title: "Sin salida reciente", description: "Ejecuta una acción antes de diagnosticar." });
      return;
    }
    if (onDiagnose) {
      onDiagnose(output);
      toast({ title: "Salida enviada", description: "El resultado se envió al Debugger." });
    } else {
      toast({ title: "Debugger notificado", description: "No se configuró un canal de diagnóstico." });
    }
  }, [activeLogs, onDiagnose, toast]);

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#141414] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.05]">
            <TerminalIcon className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Terminal &amp; Agente GUI</h2>
              <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${
                isElectronActive
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-blue-500/20 bg-blue-500/10 text-blue-300"
              }`}>
                {isElectronActive ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    {terminalReady ? `PTY nativo · ${shellInfo?.shell?.split("/").pop() ?? "shell"}` : "Conectando PTY…"}
                  </>
                ) : (
                  <>
                    <Monitor className="h-3 w-3" />
                    Modo web · Runner seguro
                  </>
                )}
              </span>
            </div>
            <p className="mt-1 max-w-xl truncate font-mono text-xs text-zinc-400">
              {shellInfo?.cwd ?? workspace}
              {shellInfo?.pid ? ` · PID ${shellInfo.pid}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <Bot className="h-3.5 w-3.5" />
            Agente
            <select
              value={activeAgent}
              onChange={(event) => setActiveAgent(event.target.value as AgentRoleId)}
              className="rounded-lg border border-white/[0.1] bg-[#1a1a1a] px-2 py-1.5 text-xs text-zinc-200 outline-none"
              aria-label="Agente activo"
            >
              {AGENT_ROLES.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Pestañas de terminal">
            {tabs.map((tab) => (
              <div key={tab.id} className={`flex items-center rounded-lg border ${
                tab.id === activeTab
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/[0.1] text-zinc-300"
              }`}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="px-2 py-1 text-[10px]"
                  aria-current={tab.id === activeTab ? "page" : undefined}
                >
                  {tab.name}
                </button>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => closeTab(tab.id)}
                    className="mr-1 rounded p-0.5 text-zinc-500 hover:text-white"
                    aria-label={`Cerrar ${tab.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addTab}
              className="rounded-lg border border-white/[0.1] bg-[#1a1a1a] p-1.5 text-zinc-300 hover:text-white"
              title="Añadir pestaña"
              aria-label="Añadir pestaña de terminal"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-[#141414] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <Cpu className="h-3.5 w-3.5" />
            Acciones rápidas
          </span>
          <span className="text-[10px] text-zinc-500">
            {isElectronActive ? "Shell nativa macOS" : "Ejecución gobernada por /api/runner"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={isRunning || (isElectronActive && !terminalReady)}
              onClick={() => void runJob(action.id, action.id === "playwright" ? playwrightPath : "")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#1a1a1a] px-3 py-2 text-xs text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              title={action.command}
            >
              <Play className={`h-3 w-3 ${currentJob === action.id ? "animate-pulse text-amber-400" : "text-emerald-400"}`} />
              {action.label}
            </button>
          ))}
        </div>
        <label className="mt-3 grid max-w-lg gap-1 text-[11px] text-zinc-400">
          Archivo de test Playwright opcional
          <input
            value={playwrightPath}
            onChange={(event) => setPlaywrightPath(event.target.value)}
            placeholder="tests/e2e/studio.spec.ts"
            className="rounded-lg border border-white/[0.1] bg-[#101012] px-3 py-2 text-xs text-zinc-100 outline-none focus:border-white/30"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0c0c0e] font-mono shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#16161a] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 truncate text-[11px] text-zinc-400">
              {isElectronActive ? "macOS PTY" : "pulse-terminal · web fallback"} · {activeTabInfo?.name ?? "Terminal"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={sendToDebugger}
              className="flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20"
            >
              <Sparkles className="h-3 w-3" />
              Debugger
            </button>
            <button
              type="button"
              onClick={() => void copyTerminal()}
              className="rounded p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              title="Copiar historial"
              aria-label="Copiar historial de terminal"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={restartTerminal}
              className="rounded p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              title="Reiniciar terminal"
              aria-label="Reiniciar terminal"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={() => closeTab(activeTab)}
                className="rounded p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                title="Cerrar pestaña activa"
                aria-label="Cerrar pestaña activa"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div
          ref={outputRef}
          className="h-[340px] overflow-auto p-4 text-[11px] leading-relaxed"
          aria-live="polite"
          aria-label="Salida de terminal"
        >
          {activeLogs.length === 0 ? (
            <p className="text-zinc-500">Sin actividad. Escribe /help para ver los comandos disponibles.</p>
          ) : (
            activeLogs.map((line) => {
              const color = {
                input: "text-emerald-400 font-semibold",
                stdout: "text-zinc-300",
                stderr: "text-rose-400",
                system: "text-zinc-500",
                agent: "text-purple-400 font-medium",
              }[line.type];
              return (
                <div key={line.id} className="flex items-start gap-2 whitespace-pre-wrap">
                  <span className="shrink-0 select-none text-[9px] text-zinc-600">{line.timestamp}</span>
                  <span className={color}>{line.text}</span>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-white/[0.08] bg-[#111114] p-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold text-emerald-400">pulse@studio:~$</span>
            <ContextMentionInput
              value={commandInput}
              sources={sourceNotebookId === notebookId ? mentionSources : []}
              onChange={setCommandInput}
              onMentionIdsChange={setMentionedDocumentIds}
              onKeyDown={handleCommandKeyDown}
              disabled={isRunning}
              multiline={false}
              placeholder="/ask tarea @fuente · /help"
              ariaLabel="Comando de terminal o solicitud al agente"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={!commandInput.trim() || isRunning}
              className="rounded bg-white px-3 py-1 text-[10px] font-semibold text-black disabled:opacity-30"
            >
              {isRunning ? "…" : "Enter"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
