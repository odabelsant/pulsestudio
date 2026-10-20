"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { getModuleHref } from "@/components/workspace/modules";

type DashboardSummary = {
  qa: {
    requirements: number;
    testCases: number;
    testPlans: number;
    testSuites: number;
    bugs: number;
    openBugs: number;
  };
  workspace: {
    chatSessions: number;
    agentActions: number;
    runnerExecutions: number;
    contextDocuments: number;
  };
  recent: {
    runnerExecutions: Array<{ id: string; job: string; status: string; startedAt: string }>;
    agentActions: Array<{ id: string; action: string; status: string; createdAt: string }>;
  };
  productivity?: {
    created: number;
    updated: number;
    deleted: number;
    approved: number;
    rejected: number;
    exported: number;
    context_uploaded: number;
    agent_step: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export default function WorkspaceDashboardView() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/dashboard", { signal, cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !isRecord(data) || !isRecord(data.qa) || !isRecord(data.workspace) || !isRecord(data.recent)) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "No se pudo cargar el dashboard.");
      }
      setSummary(data as DashboardSummary);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el dashboard.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [refresh]);

  const qaCards = summary
    ? [
        { label: "Requirements", value: summary.qa.requirements, href: getModuleHref("requirements") },
        { label: "Test Cases", value: summary.qa.testCases, href: getModuleHref("test_cases") },
        { label: "Test Plans", value: summary.qa.testPlans, href: getModuleHref("test_plans") },
        { label: "Test Suites", value: summary.qa.testSuites, href: getModuleHref("test_suites") },
        { label: "Bugs abiertos", value: summary.qa.openBugs, href: getModuleHref("bugs"), hint: `${summary.qa.bugs} total` },
      ]
    : [];

  const workspaceCards = summary
    ? [
        { label: "Conversaciones", value: summary.workspace.chatSessions },
        { label: "Acciones del agente", value: summary.workspace.agentActions },
        { label: "Ejecuciones Runner", value: summary.workspace.runnerExecutions },
        { label: "Documentos de contexto", value: summary.workspace.contextDocuments },
      ]
    : [];

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 p-5 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E85D5D]">
            PulseStudio · Resumen local
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#E8F0F3] sm:text-3xl">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#A6B5BE]">
            Métricas reales del espacio de trabajo: QA local, historial y contexto persistidos en SQLite.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          Actualizar
        </Button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[#E8F0F3]">QA Management</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loading && !summary
            ? Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl border border-[#223039] bg-[#10181D]/70" />
              ))
            : qaCards.map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  className="rounded-xl border border-[#223039] bg-[#10181D]/70 p-4 transition hover:border-[#30434D] hover:bg-[#141F25]"
                >
                  <p className="text-xs text-[#758792]">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#E8F0F3]">{card.value}</p>
                  {"hint" in card && card.hint ? <p className="mt-1 text-[10px] text-[#758792]">{card.hint}</p> : null}
                </Link>
              ))}
        </div>
      </div>

      {summary?.productivity && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#E8F0F3]">Pizarra de productividad</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Pasos del agente", value: summary.productivity.agent_step },
              { label: "Aprobados", value: summary.productivity.approved },
              { label: "Rechazados", value: summary.productivity.rejected },
              { label: "Exportaciones", value: summary.productivity.exported },
              { label: "Contextos subidos", value: summary.productivity.context_uploaded },
              { label: "Registros creados", value: summary.productivity.created },
              { label: "Actualizados", value: summary.productivity.updated },
              { label: "Eliminados", value: summary.productivity.deleted },
            ].map((card) => (
              <Link
                key={card.label}
                href={getModuleHref("productividad")}
                className="rounded-xl border border-[#223039] bg-[#10181D]/70 p-4 transition hover:border-[#30434D]"
              >
                <p className="text-xs text-[#758792]">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-[#E8F0F3]">{card.value}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[#E8F0F3]">Workspace</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {loading && !summary
            ? Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl border border-[#223039] bg-[#10181D]/70" />
              ))
            : workspaceCards.map((card) => (
                <div key={card.label} className="rounded-xl border border-[#223039] bg-[#10181D]/70 p-4">
                  <p className="text-xs text-[#758792]">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#E8F0F3]">{card.value}</p>
                </div>
              ))}
        </div>
      </div>

      {summary && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#223039] bg-[#10181D]/70 p-4">
            <h2 className="text-sm font-semibold text-[#E8F0F3]">Últimas ejecuciones del Runner</h2>
            {summary.recent.runnerExecutions.length === 0 ? (
              <p className="mt-3 text-xs text-[#758792]">Todavía no hay ejecuciones registradas.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {summary.recent.runnerExecutions.map((item) => (
                  <li key={item.id} className="rounded-lg border border-[#223039] px-3 py-2 text-xs text-[#A6B5BE]">
                    <span className="font-medium text-[#E8F0F3]">{item.job}</span>
                    <span className="text-[#758792]"> · {item.status} · {formatWhen(item.startedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-[#223039] bg-[#10181D]/70 p-4">
            <h2 className="text-sm font-semibold text-[#E8F0F3]">Últimas acciones del Action Agent</h2>
            {summary.recent.agentActions.length === 0 ? (
              <p className="mt-3 text-xs text-[#758792]">Todavía no hay borradores auditados.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {summary.recent.agentActions.map((item) => (
                  <li key={item.id} className="rounded-lg border border-[#223039] px-3 py-2 text-xs text-[#A6B5BE]">
                    <span className="font-medium text-[#E8F0F3]">{item.action}</span>
                    <span className="text-[#758792]"> · {item.status} · {formatWhen(item.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
