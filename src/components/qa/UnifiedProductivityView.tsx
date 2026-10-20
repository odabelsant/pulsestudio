"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  PanelRight,
  Plus,
  Send,
  Sparkles,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import AlmSettingsView from "@/components/alm/AlmSettingsView";
import ChatInterface, { ContextMentionInput, type ChatMessage, type MentionSource } from "@/components/chat/ChatInterface";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import type { ProductivityMetricKind } from "@/lib/productivity-metrics";
import { QA_ENTITY_OPTIONS } from "@/lib/qa-module-config";
import { buildQaCsvExport, buildQaMarkdownExport, downloadTextFile } from "@/lib/qa-export";
import type { QaEntity } from "@/lib/qa-domain";

type PermissionMode = "manual" | "assisted";

type BrainArtifact = { id: string; name: string; description: string };

type PendingStep = {
  id: string;
  title: string;
  detail: string;
};

const thinkingMessages = [
  "Analizando entidad y contexto…",
  "Preparando siguiente paso…",
  "Esperando tu decisión…",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function recordMetric(kind: ProductivityMetricKind, entity?: QaEntity, label?: string) {
  try {
    await apiFetch("/api/productivity/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, entity, label }),
    });
  } catch {
    // métricas best-effort
  }
}

export default function UnifiedProductivityView({ initialEntity }: { initialEntity?: QaEntity }) {
  const router = useRouter();
  const [entity, setEntity] = useState<QaEntity>(initialEntity ?? "requirements");

  useEffect(() => {
    if (initialEntity) setEntity(initialEntity);
  }, [initialEntity]);
  const [connectionsOpen, setConnectionsOpen] = useState(true);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("manual");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [responseText, setResponseText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [input, setInput] = useState("");
  const [mentionSources, setMentionSources] = useState<MentionSource[]>([]);
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [agents, setAgents] = useState<BrainArtifact[]>([]);
  const [skills, setSkills] = useState<BrainArtifact[]>([]);
  const [attachedSkillIds, setAttachedSkillIds] = useState<string[]>([]);
  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const [boardMetrics, setBoardMetrics] = useState<Record<ProductivityMetricKind, number> | null>(null);
  const [qaCounts, setQaCounts] = useState<Record<string, number> | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const contextInputRef = useRef<HTMLInputElement>(null);

  const entityLabel = QA_ENTITY_OPTIONS.find((option) => option.id === entity)?.label ?? entity;
  const thinkingMessage = thinkingMessages[thinkingStep] ?? thinkingMessages[thinkingMessages.length - 1];

  const refreshBoard = useCallback(async (signal?: AbortSignal) => {
    try {
      const [metricsRes, dashboardRes] = await Promise.all([
        apiFetch("/api/productivity/metrics", { signal, cache: "no-store" }),
        apiFetch("/api/dashboard", { signal, cache: "no-store" }),
      ]);
      const metricsData: unknown = await metricsRes.json();
      const dashboardData: unknown = await dashboardRes.json();
      if (metricsRes.ok && isRecord(metricsData) && isRecord(metricsData.totals)) {
        setBoardMetrics(metricsData.totals as Record<ProductivityMetricKind, number>);
      }
      if (dashboardRes.ok && isRecord(dashboardData) && isRecord(dashboardData.qa)) {
        setQaCounts(dashboardData.qa as Record<string, number>);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void refreshBoard(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [refreshBoard]);

  useEffect(() => {
    void apiFetch("/api/brain").then(async (response) => {
      const data: unknown = await response.json();
      if (!response.ok || !isRecord(data)) return;
      if (Array.isArray(data.agents)) {
        setAgents(data.agents.filter((item): item is BrainArtifact => isRecord(item) && typeof item.id === "string" && typeof item.name === "string"));
      }
      if (Array.isArray(data.skills)) {
        setSkills(data.skills.filter((item): item is BrainArtifact => isRecord(item) && typeof item.id === "string" && typeof item.name === "string"));
      }
    });
    void apiFetch("/api/context").then(async (response) => {
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) return;
      setMentionSources(
        data.flatMap((doc) => {
          if (!isRecord(doc) || typeof doc.id !== "string" || typeof doc.moduleName !== "string") return [];
          return [{
            id: doc.id,
            moduleName: doc.moduleName,
            projectName: typeof doc.projectName === "string" ? doc.projectName : "Contexto",
          }];
        }),
      );
    });
  }, []);

  useEffect(() => {
    if (!isStreaming) return;
    const intervalId = window.setInterval(() => {
      setThinkingStep((step) => Math.min(step + 1, thinkingMessages.length - 1));
    }, 1600);
    return () => window.clearInterval(intervalId);
  }, [isStreaming]);

  const boardCards = useMemo(() => {
    const totals = boardMetrics ?? {
      created: 0,
      updated: 0,
      deleted: 0,
      approved: 0,
      rejected: 0,
      exported: 0,
      context_uploaded: 0,
      agent_step: 0,
    };
    return [
      { label: "Requirements", value: qaCounts?.requirements ?? 0 },
      { label: "Test Cases", value: qaCounts?.testCases ?? 0 },
      { label: "Test Plans", value: qaCounts?.testPlans ?? 0 },
      { label: "Test Suites", value: qaCounts?.testSuites ?? 0 },
      { label: "Bugs abiertos", value: qaCounts?.openBugs ?? 0 },
      { label: "Aprobados (sesión)", value: totals.approved },
      { label: "Rechazados (sesión)", value: totals.rejected },
      { label: "Exportaciones", value: totals.exported },
    ];
  }, [boardMetrics, qaCounts]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || pendingStep) return;
    setIsStreaming(true);
    setThinkingStep(0);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    try {
      const step: PendingStep = {
        id: crypto.randomUUID(),
        title: `Paso propuesto · ${entityLabel}`,
        detail: permissionMode === "assisted"
          ? `Acción sugerida sobre ${entityLabel}: ${trimmed.slice(0, 240)}`
          : `Revisa antes de continuar: ${trimmed.slice(0, 240)}`,
      };
      const assistantContent = permissionMode === "assisted"
        ? `Modo asistido: preparé un borrador para ${entityLabel}. Confirma o rechaza para avanzar.`
        : "Modo manual: no ejecutaré cambios hasta que apruebes el paso.";
      setPendingStep(step);
      setResponseText(assistantContent);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: assistantContent },
      ]);
      await recordMetric("agent_step", entity, step.title);
      void refreshBoard();
    } finally {
      setIsStreaming(false);
    }
  }

  async function resolvePendingStep(approved: boolean) {
    if (!pendingStep) return;
    const kind: ProductivityMetricKind = approved ? "approved" : "rejected";
    await recordMetric(kind, entity, pendingStep.title);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: approved
          ? `Aprobaste: ${pendingStep.title}. Puedes persistir el registro en el panel inferior o pedir otro paso.`
          : `Rechazaste: ${pendingStep.title}. Ajusta la instrucción e inténtalo de nuevo.`,
      },
    ]);
    setPendingStep(null);
    setResponseText("");
    void refreshBoard();
  }

  async function exportEntity(format: "md" | "csv") {
    setExportBusy(true);
    try {
      const response = await apiFetch(`/api/qa/${entity}`, { cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        throw new Error("No se pudieron leer los registros para exportar.");
      }
      const records = data.filter((item): item is Record<string, unknown> & { id: string } => isRecord(item) && typeof item.id === "string");
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "md") {
        downloadTextFile(`${entity}-${stamp}.md`, buildQaMarkdownExport(entity, records), "text/markdown;charset=utf-8");
      } else {
        downloadTextFile(`${entity}-${stamp}.csv`, buildQaCsvExport(entity, records), "text/csv;charset=utf-8");
      }
      await recordMetric("exported", entity, format);
      setNotification(`Exportación ${format.toUpperCase()} completada.`);
      void refreshBoard();
    } catch (cause) {
      setNotification(cause instanceof Error ? cause.message : "Exportación fallida.");
    } finally {
      setExportBusy(false);
    }
  }

  async function uploadContextFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadBusy(true);
    try {
      const form = new FormData();
      form.set("projectName", `Productividad · ${entityLabel}`);
      Array.from(files).forEach((file, index) => {
        form.append("files", file);
        form.append(`paths[${index}]`, file.name);
      });
      const response = await apiFetch("/api/context/import", { method: "POST", body: form });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "No se pudo subir el contexto.");
      }
      await recordMetric("context_uploaded", entity, `${files.length} archivo(s)`);
      setNotification("Contexto importado. Menciona fuentes con @ en el chat.");
      void refreshBoard();
    } catch (cause) {
      setNotification(cause instanceof Error ? cause.message : "Error al subir contexto.");
    } finally {
      setUploadBusy(false);
      if (contextInputRef.current) contextInputRef.current.value = "";
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-[#223039] bg-[#0A1014]/80 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px]">
            <label className="sr-only" htmlFor="qa-entity-select">Entidad QA</label>
            <select
              id="qa-entity-select"
              value={entity}
              onChange={(event) => {
                const next = event.target.value as QaEntity;
                setEntity(next);
                router.replace(`/productividad?entity=${encodeURIComponent(next)}`, { scroll: false });
              }}
              className="w-full appearance-none rounded-lg border border-[#30434D] bg-[#10181D] py-2 pl-3 pr-9 text-sm font-medium text-[#E8F0F3] outline-none focus:border-[#E85D5D]/50"
            >
              {QA_ENTITY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-[#758792]" />
          </div>

          <input
            ref={contextInputRef}
            type="file"
            accept=".md,.mdx,.txt,.pdf,.docx"
            multiple
            className="hidden"
            onChange={(event) => void uploadContextFiles(event.target.files)}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploadBusy} onClick={() => contextInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {uploadBusy ? "Subiendo…" : "Subir contexto"}
          </Button>

          <div className="relative">
            <Button type="button" variant="outline" size="sm" disabled={exportBusy} onClick={() => void exportEntity("md")}>
              <Download className="h-3.5 w-3.5" />
              Descargar .md
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={exportBusy} onClick={() => void exportEntity("csv")}>
            <Download className="h-3.5 w-3.5" />
            Excel (.csv)
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setConnectionsOpen((open) => !open)}
            aria-pressed={connectionsOpen}
          >
            <PanelRight className="h-3.5 w-3.5" />
            Conexiones
          </Button>
        </div>
        {notification && (
          <p className="mt-2 rounded-lg border border-[#30434D] bg-[#10181D] px-3 py-2 text-xs text-[#A6B5BE]">
            {notification}
            <button type="button" className="ml-2 text-[#E85D5D]" onClick={() => setNotification(null)}>Cerrar</button>
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col border-[#223039] lg:border-r">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#223039]/70 px-4 py-2.5 sm:px-6">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#758792]">Permisos</span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#A6B5BE]">
              <input
                type="radio"
                name="permission-mode"
                checked={permissionMode === "manual"}
                onChange={() => setPermissionMode("manual")}
                className="accent-[#E85D5D]"
              />
              Manual Permissions
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#A6B5BE]">
              <input
                type="radio"
                name="permission-mode"
                checked={permissionMode === "assisted"}
                onChange={() => setPermissionMode("assisted")}
                className="accent-[#E85D5D]"
              />
              Assisted permissions auto
            </label>
            <p className="flex items-center gap-1.5 text-[10px] text-amber-200/90">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Cada paso requiere aprobación explícita antes de persistir o sincronizar.
            </p>
          </div>

          <div className="flex min-h-[280px] flex-1 flex-col px-4 py-4 sm:px-6">
            <ChatInterface
              messages={messages}
              responseText={responseText}
              isStreaming={isStreaming}
              thinkingMessage={thinkingMessage}
              onSendDiffToApprovals={() => undefined}
            />

            {pendingStep && (
              <div className="mt-4 rounded-xl border border-[#E85D5D]/30 bg-[#10181D] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#E85D5D]">Paso pendiente</p>
                <p className="mt-1 text-sm font-medium text-[#E8F0F3]">{pendingStep.title}</p>
                <p className="mt-2 text-xs leading-5 text-[#A6B5BE]">{pendingStep.detail}</p>
                {mentionedDocumentIds.length > 0 && (
                  <p className="mt-2 text-[10px] text-[#758792]">Contexto @: {mentionedDocumentIds.length} documento(s)</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void resolvePendingStep(true)}>
                    <Check className="h-3.5 w-3.5" />
                    Aprobar paso
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void resolvePendingStep(false)}>
                    <X className="h-3.5 w-3.5" />
                    Rechazar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-[#223039] bg-[#080D10]/95 px-4 pb-4 pt-3 sm:px-6">
            <div className="relative rounded-2xl border border-[#30434D] bg-[#10181D] p-2 shadow-lg">
              {showAddMenu && (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-10 w-72 overflow-hidden rounded-xl border border-[#30434D] bg-[#141F25] p-1.5 shadow-xl">
                  <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#758792]">Adjuntar</p>
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      className="add-menu-item w-full"
                      onClick={() => {
                        setAttachedSkillIds((current) =>
                          current.includes(skill.id) ? current.filter((id) => id !== skill.id) : [...current, skill.id],
                        );
                        setShowAddMenu(false);
                      }}
                    >
                      <Wrench />
                      {skill.name}
                      <span>{attachedSkillIds.includes(skill.id) ? "✓" : "+"}</span>
                    </button>
                  ))}
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      className="add-menu-item w-full"
                      onClick={() => {
                        setInput((current) => `${current}${current ? " " : ""}@${agent.name.replace(/\s+/g, "-")}`);
                        setShowAddMenu(false);
                      }}
                    >
                      <Sparkles />
                      {agent.name}
                    </button>
                  ))}
                </div>
              )}
              <ContextMentionInput
                value={input}
                sources={mentionSources}
                onChange={setInput}
                onMentionIdsChange={setMentionedDocumentIds}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={Boolean(pendingStep)}
                placeholder="Instrucción paso a paso… menciona @contexto"
                ariaLabel="Mensaje del agente de productividad"
                className="block w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-[#E8F0F3] outline-none placeholder:text-[#758792]"
              />
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setShowAddMenu((shown) => !shown)}
                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${showAddMenu ? "bg-[#E85D5D] text-[#080D10]" : "text-[#758792] hover:bg-[#19262D] hover:text-[#E8F0F3]"}`}
                  aria-label="Añadir skills o agentes"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!input.trim() || isStreaming || Boolean(pendingStep)}
                  onClick={() => void sendMessage()}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-[#E85D5D] text-[#080D10] transition hover:bg-[#F16B75] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {connectionsOpen && (
          <aside className="w-full shrink-0 border-t border-[#223039] bg-[#0A1014] lg:w-[min(100%,380px)] lg:border-t-0">
            <div className="max-h-[420px] overflow-y-auto p-4 lg:max-h-[calc(100vh-8rem)] lg:sticky lg:top-14">
              <h2 className="mb-2 text-sm font-semibold text-[#E8F0F3]">Conexiones ALM</h2>
              <p className="mb-4 text-xs leading-5 text-[#758792]">
                Tokens y endpoints para Azure DevOps, Jira, Trello y entornos similares.
              </p>
              <AlmSettingsView />
            </div>
          </aside>
        )}
      </div>

      <section className="border-t border-[#223039] bg-[#0A1014] px-4 py-4 sm:px-6">
        <h2 className="mb-3 text-sm font-semibold text-[#E8F0F3]">Pizarra de resultados</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {boardCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-[#223039] bg-[#10181D]/80 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#758792]">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[#E8F0F3]">{card.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-[#758792]">
          Los totales QA alimentan las tarjetas del Dashboard global; las acciones de sesión se registran en el historial local.
        </p>
      </section>
    </div>
  );
}
