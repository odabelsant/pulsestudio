"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, ClipboardList, LoaderCircle, MessageSquareText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface HistorySession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: HistoryMessage[];
}

interface AgentActionHistory {
  id: string;
  storyReference: string | null;
  action: string;
  status: string;
  testCases: string;
  syncResult: string | null;
  createdAt: string;
}

interface UnifiedHistoryViewProps {
  onOpenSession: (session: HistorySession) => void;
}

interface HistoryResponse {
  sessions: HistorySession[];
  agentActions: AgentActionHistory[];
}

function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function caseCount(serialized: string): number {
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default function UnifiedHistoryView({ onOpenSession }: UnifiedHistoryViewProps) {
  const [history, setHistory] = useState<HistoryResponse>({ sessions: [], agentActions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/history", { signal, cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok || typeof body !== "object" || body === null || !("sessions" in body) || !("agentActions" in body)) {
        const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : "No se pudo cargar el historial.";
        throw new Error(message);
      }
      const result = body as HistoryResponse;
      setHistory(result);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void loadHistory(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadHistory]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Historial unificado</h2>
          <p className="mt-1 text-xs text-zinc-500">Conversaciones y auditoría Action Agent · retención automática de 15 días.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadHistory()}>
          {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          Actualizar
        </Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs text-rose-200">{error}</p>}
      {loading && (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Cargando y depurando registros antiguos…
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <MessageSquareText className="h-3.5 w-3.5" /> Conversaciones
          </h3>
          {!loading && history.sessions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/[0.1] p-5 text-xs text-zinc-500">Todavía no hay conversaciones guardadas.</p>
          ) : history.sessions.map((session) => (
            <article key={session.id} className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-medium text-zinc-100">{session.title}</h4>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    {session.messages.length} mensaje(s) · actualizado {readableDate(session.updatedAt)}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => onOpenSession(session)}>
                  Abrir
                </Button>
              </div>
              {session.messages.slice(-2).map((message) => (
                <p key={message.id} className="mt-2 line-clamp-2 text-[10px] leading-4 text-zinc-500">
                  <span className="text-zinc-300">{message.role === "user" ? "Tú" : "PulseStudio"}:</span> {message.content}
                </p>
              ))}
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <ClipboardList className="h-3.5 w-3.5" /> Auditoría Action Agent
          </h3>
          {!loading && history.agentActions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/[0.1] p-5 text-xs text-zinc-500">Todavía no hay acciones registradas.</p>
          ) : history.agentActions.map((action) => (
            <article key={action.id} className="rounded-xl border border-white/[0.08] bg-[#141414] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs font-medium text-zinc-100">
                    {action.action === "CLEARED" ? "Pizarra limpiada" : action.action === "APPROVE_SYNC" ? "Aprobación / sincronización" : "Casos generados"}
                  </h4>
                  <p className="mt-1 truncate text-[10px] text-zinc-500">
                    {action.storyReference || "Sin referencia HU"} · {caseCount(action.testCases)} caso(s) · {readableDate(action.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${
                  action.status === "SYNCED"
                    ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
                    : action.status === "APPROVED"
                      ? "border-amber-500/20 bg-amber-500/[0.07] text-amber-300"
                      : "border-zinc-500/20 bg-zinc-500/[0.07] text-zinc-300"
                }`}>
                  {action.status}
                </span>
              </div>
              {action.syncResult && (
                <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-zinc-400">{action.syncResult}</p>
              )}
              <p className="mt-2 flex items-center gap-1 text-[9px] text-zinc-600">
                <Activity className="h-3 w-3" /> Registro persistido localmente
              </p>
            </article>
          ))}
        </section>
      </div>
      <p className="flex items-center gap-2 text-[10px] text-zinc-600">
        <Bot className="h-3 w-3" /> Los mensajes y casos se guardan en SQLite a través de Prisma.
      </p>
    </section>
  );
}
