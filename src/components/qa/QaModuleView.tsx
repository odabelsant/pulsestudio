"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import type { QaEntity } from "@/lib/qa-domain";
import type { ProductivityMetricKind } from "@/lib/productivity-metrics";
import {
  emptyQaForm,
  parseStoredContext,
  QA_MODULE_CONFIG,
  qaFormToPayload,
  qaRecordSummary,
  qaRecordToForm,
  type QaRecord,
} from "@/lib/qa-module-config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function QaModuleView({
  entity,
  embedded = false,
  onActivity,
}: {
  entity: QaEntity;
  embedded?: boolean;
  onActivity?: (kind: ProductivityMetricKind) => void;
}) {
  const config = QA_MODULE_CONFIG[entity];
  const [records, setRecords] = useState<QaRecord[]>([]);
  const [form, setForm] = useState<Record<string, string>>(() => emptyQaForm(entity));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/qa/${entity}`, { signal, cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "No se pudieron cargar los datos.");
      }
      setRecords(data.filter((item): item is QaRecord => isRecord(item) && typeof item.id === "string"));
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    setForm(emptyQaForm(entity));
    setEditingId(null);
  }, [entity]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [refresh]);

  function edit(record: QaRecord) {
    setEditingId(record.id);
    setForm(qaRecordToForm(entity, record));
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyQaForm(entity));
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = qaFormToPayload(entity, form);
      const editingRecord = editingId ? records.find((item) => item.id === editingId) : undefined;
      if (entity === "test-cases" && editingRecord) {
        payload.contextReferences = parseStoredContext(editingRecord.contextReferences);
        payload.contextNotebookId = typeof editingRecord.contextNotebookId === "string"
          ? editingRecord.contextNotebookId
          : null;
      }
      if (editingId) payload.id = editingId;
      const response = await apiFetch(`/api/qa/${entity}`, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "No se pudo guardar el registro.");
      }
      onActivity?.(editingId ? "updated" : "created");
      resetForm();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el registro.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(record: QaRecord) {
    if (!window.confirm(`¿Eliminar "${qaRecordSummary(entity, record)}"?`)) return;
    setError(null);
    try {
      const response = await apiFetch(`/api/qa/${entity}?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "No se pudo eliminar el registro.");
      }
      onActivity?.("deleted");
      if (editingId === record.id) resetForm();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el registro.");
    }
  }

  return (
    <section className={`mx-auto w-full space-y-6 ${embedded ? "max-w-none px-4 sm:px-6" : "max-w-6xl p-5 sm:p-8"}`}>
      {!embedded && (
        <header>
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E85D5D]">
            QA Management · Datos locales
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#E8F0F3] sm:text-3xl">{config.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#A6B5BE]">{config.description}</p>
          <p className="mt-2 text-[11px] text-[#758792]">Los cambios se guardan localmente. No se escriben en Azure DevOps ni Jira.</p>
        </header>
      )}

      {embedded && (
        <header>
          <h2 className="text-sm font-semibold text-[#E8F0F3]">Registros · {config.title}</h2>
          <p className="mt-1 text-xs text-[#758792]">{config.description}</p>
        </header>
      )}

      {error && <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

      <form onSubmit={(event) => void save(event)} className="grid gap-4 rounded-2xl border border-[#223039] bg-[#10181D] p-4 sm:grid-cols-2 sm:p-5">
        <h2 className="text-sm font-semibold text-[#E8F0F3] sm:col-span-2">{editingId ? "Editar registro local" : `Nuevo registro · ${config.title}`}</h2>
        {config.fields.map((field) => (
          <label key={field.key} className={`grid gap-1.5 text-xs text-[#A6B5BE] ${field.kind === "textarea" || field.kind === "json" || field.kind === "list" ? "sm:col-span-2" : ""}`}>
            {field.label}
            {field.kind === "select" ? (
              <select
                required={field.required}
                value={form[field.key] ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                className="h-10 rounded-lg border border-[#30434D] bg-[#0A1014] px-3 text-sm text-[#E8F0F3]"
              >
                {field.options?.map((option) => <option key={option || "empty"} value={option}>{option || "Sin seleccionar"}</option>)}
              </select>
            ) : field.kind === "textarea" || field.kind === "json" || field.kind === "list" ? (
              <textarea
                required={field.required}
                value={form[field.key] ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                rows={field.kind === "json" ? 5 : 3}
                className="rounded-lg border border-[#30434D] bg-[#0A1014] px-3 py-2 text-sm text-[#E8F0F3]"
                spellCheck={field.kind !== "json"}
              />
            ) : (
              <input
                type={field.kind === "date" ? "date" : "text"}
                required={field.required}
                value={form[field.key] ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                className="h-10 rounded-lg border border-[#30434D] bg-[#0A1014] px-3 text-sm text-[#E8F0F3]"
              />
            )}
          </label>
        ))}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear"}</Button>
          {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancelar edición</Button>}
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#E8F0F3]">Listado</h2>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>Actualizar</Button>
        </div>
        {loading ? (
          <p className="rounded-xl border border-[#223039] p-5 text-sm text-[#758792]">Cargando registros…</p>
        ) : records.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#30434D] p-6 text-sm text-[#758792]">Todavía no hay registros locales en este módulo.</p>
        ) : records.map((record) => (
          <article key={record.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#223039] bg-[#10181D]/70 p-4">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold text-[#E8F0F3]">{qaRecordSummary(entity, record)}</h3>
              <p className="mt-1 break-all text-[10px] text-[#758792]">
                {typeof record.key === "string" ? `${record.key} · ` : ""}
                Estado: {typeof record.status === "string" ? record.status : "—"} · ID: {record.id}
              </p>
              {typeof record.description === "string" && record.description && (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#A6B5BE]">{record.description}</p>
              )}
              {entity === "test-cases" && typeof record.contentHash === "string" && (
                <p className="mt-2 font-mono text-[9px] text-[#758792]">SHA-256: {record.contentHash.slice(0, 16)}…</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => edit(record)}>Editar</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void remove(record)}>Eliminar</Button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
