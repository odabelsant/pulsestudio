"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Circle, LoaderCircle } from "lucide-react";

export type RoadmapStatus = "pending" | "in-progress" | "completed" | "failed";

export interface RoadmapStep {
  id: string;
  label: string;
  status: RoadmapStatus;
  detail?: string;
}

export default function ActionAgentRoadmap({ steps }: { steps: RoadmapStep[] }) {
  const [expandedError, setExpandedError] = useState<string | null>(null);
  if (steps.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-white/[0.08] bg-[#101012] p-4"
      aria-label="Progreso de Action Agent"
      aria-live="polite"
    >
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Vectores Roadmap
      </h3>
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const Icon = step.status === "completed"
            ? CheckCircle2
            : step.status === "in-progress"
              ? LoaderCircle
              : step.status === "failed"
                ? AlertCircle
                : Circle;
          const statusColor = step.status === "completed"
            ? "text-emerald-400"
            : step.status === "in-progress"
              ? "text-amber-300"
              : step.status === "failed"
                ? "text-rose-400"
                : "text-zinc-600";
          const node = (
            <>
              <Icon className={`h-4 w-4 shrink-0 ${statusColor} ${step.status === "in-progress" ? "animate-spin" : ""}`} />
              <span className="min-w-0 flex-1 text-xs text-zinc-300">{step.label}</span>
              {step.status === "failed" && <span className="text-[10px] text-rose-300">Ver detalle</span>}
            </>
          );

          return (
            <li key={step.id}>
              {step.status === "failed" ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left"
                  aria-expanded={expandedError === step.id}
                  onClick={() => setExpandedError((current) => current === step.id ? null : step.id)}
                >
                  {node}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {node}
                </div>
              )}
              {index < steps.length - 1 && (
                <div className="ml-[7px] mt-1 h-2 border-l border-white/[0.12]" aria-hidden="true" />
              )}
              {step.status === "failed" && expandedError === step.id && (
                <pre className="ml-6 mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs leading-5 text-rose-200">
                  {step.detail || "No se recibió más detalle del error."}
                </pre>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
