"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  FilePlus2,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  StickyNote,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MentionSource } from "@/components/chat/ChatInterface";

export interface ContextDocument extends MentionSource {
  id: string;
  markdownContent: string;
  tags: string;
  sourceType?: string | null;
  createdAt?: string;
}

interface ContextNotebook {
  id: string;
  title: string;
  notes: string;
  createdAt: string;
  _count?: { documents: number };
}

interface ContextLibraryViewProps {
  onAttach?: (document: ContextDocument) => void;
  onActiveNotebookChange?: (notebookId: string | null) => void;
  onSourcesChange?: (sources: ContextDocument[]) => void;
}

function errorFromResult(result: unknown, fallback: string) {
  return typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
    ? result.error
    : fallback;
}

function formatSourceType(document: ContextDocument) {
  return document.sourceType?.toUpperCase() || document.moduleName.split(".").pop()?.toUpperCase() || "FUENTE";
}

export default function ContextLibraryView({
  onAttach,
  onActiveNotebookChange,
  onSourcesChange,
}: ContextLibraryViewProps) {
  const [notebooks, setNotebooks] = useState<ContextNotebook[]>([]);
  const [activeNotebook, setActiveNotebook] = useState<ContextNotebook | null>(null);
  const [documents, setDocuments] = useState<ContextDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [showCreateNotebook, setShowCreateNotebook] = useState(false);
  const [editingNotebookTitle, setEditingNotebookTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [showSourceEditor, setShowSourceEditor] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadNotebooks = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/context/notebooks", { signal, cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok || !Array.isArray(result)) {
        throw new Error(errorFromResult(result, "No se pudieron cargar los cuadernos."));
      }
      setNotebooks(result as ContextNotebook[]);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los cuadernos.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async (notebookId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/context?notebookId=${encodeURIComponent(notebookId)}`, { cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok || !Array.isArray(result)) {
        throw new Error(errorFromResult(result, "No se pudieron cargar las fuentes del cuaderno."));
      }
      const sources = result as ContextDocument[];
      setDocuments(sources);
      onSourcesChange?.(sources);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las fuentes del cuaderno.");
      setDocuments([]);
      onSourcesChange?.([]);
    } finally {
      setLoading(false);
    }
  }, [onSourcesChange]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void loadNotebooks(controller.signal), 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadNotebooks]);

  function openNotebook(notebook: ContextNotebook) {
    setActiveNotebook(notebook);
    setTitleDraft(notebook.title);
    setNotesDraft(notebook.notes);
    setShowSourceEditor(false);
    setEditingSourceId(null);
    setError(null);
    setNotice(null);
    onActiveNotebookChange?.(notebook.id);
    onSourcesChange?.([]);
    void loadDocuments(notebook.id);
  }

  function returnToGallery() {
    setActiveNotebook(null);
    setDocuments([]);
    setEditingNotebookTitle(false);
    setShowSourceEditor(false);
    onActiveNotebookChange?.(null);
    onSourcesChange?.([]);
  }

  async function createNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newNotebookTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/context/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("id" in result)) {
        throw new Error(errorFromResult(result, "No se pudo crear el cuaderno."));
      }
      const notebook = result as ContextNotebook;
      setNotebooks((current) => [notebook, ...current]);
      setNewNotebookTitle("");
      setShowCreateNotebook(false);
      openNotebook(notebook);
      setNotice("Cuaderno creado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el cuaderno.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotebook(update: { title?: string; notes?: string }) {
    if (!activeNotebook || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/context/notebooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeNotebook.id,
          title: update.title ?? activeNotebook.title,
          notes: update.notes ?? activeNotebook.notes,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("id" in result)) {
        throw new Error(errorFromResult(result, "No se pudo guardar el cuaderno."));
      }
      const saved = result as ContextNotebook;
      setActiveNotebook(saved);
      setTitleDraft(saved.title);
      setNotesDraft(saved.notes);
      setNotebooks((current) => current.map((item) => item.id === saved.id ? { ...item, ...saved } : item));
      setEditingNotebookTitle(false);
      setNotice(update.title ? "Título actualizado." : "Notas guardadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cuaderno.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNotebook(notebook: ContextNotebook) {
    if (!window.confirm(`¿Eliminar el cuaderno "${notebook.title}" y todas sus fuentes?`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/context/notebooks?id=${encodeURIComponent(notebook.id)}`, { method: "DELETE" });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorFromResult(result, "No se pudo eliminar el cuaderno."));
      setNotebooks((current) => current.filter((item) => item.id !== notebook.id));
      if (activeNotebook?.id === notebook.id) returnToGallery();
      setNotice("Cuaderno eliminado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el cuaderno.");
    }
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeNotebook || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/context", {
        method: editingSourceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingSourceId ? { id: editingSourceId } : {}),
          projectName: activeNotebook.title,
          moduleName: sourceTitle.trim(),
          markdownContent: sourceContent,
          tags: [],
          sourceType: "md",
          notebookId: activeNotebook.id,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("id" in result)) {
        throw new Error(errorFromResult(result, "No se pudo guardar la fuente."));
      }
      const saved = result as ContextDocument;
      setDocuments((current) => [saved, ...current.filter((document) => document.id !== saved.id)]);
      const nextDocuments = [saved, ...documents.filter((document) => document.id !== saved.id)];
      onSourcesChange?.(nextDocuments);
      setSourceTitle("");
      setSourceContent("");
      setEditingSourceId(null);
      setShowSourceEditor(false);
      setNotice("Fuente guardada en el cuaderno.");
      await loadNotebooks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la fuente.");
    } finally {
      setSaving(false);
    }
  }

  function editSource(document: ContextDocument) {
    setEditingSourceId(document.id);
    setSourceTitle(document.moduleName);
    setSourceContent(document.markdownContent);
    setShowSourceEditor(true);
    setNotice(null);
  }

  async function deleteSource(document: ContextDocument) {
    if (!window.confirm(`¿Eliminar la fuente "${document.moduleName}"?`)) return;
    try {
      const response = await fetch(`/api/context?id=${encodeURIComponent(document.id)}`, { method: "DELETE" });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(errorFromResult(result, "No se pudo eliminar la fuente."));
      const nextDocuments = documents.filter((item) => item.id !== document.id);
      setDocuments(nextDocuments);
      onSourcesChange?.(nextDocuments);
      if (editingSourceId === document.id) {
        setShowSourceEditor(false);
        setEditingSourceId(null);
      }
      setNotice("Fuente eliminada.");
      await loadNotebooks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la fuente.");
    }
  }

  async function importSources(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !activeNotebook) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("notebookId", activeNotebook.id);
      form.set("projectName", activeNotebook.title);
      form.set("paths", JSON.stringify(files.map((file) => file.name)));
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/context/import", { method: "POST", body: form });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("documents" in result) ||
        !Array.isArray(result.documents)
      ) {
        throw new Error(errorFromResult(result, "No se pudieron importar las fuentes."));
      }
      const imported = result.documents as ContextDocument[];
      const nextDocuments = [...imported, ...documents];
      setDocuments(nextDocuments);
      onSourcesChange?.(nextDocuments);
      setNotice(`${imported.length} fuente(s) añadida(s) al cuaderno.`);
      await loadNotebooks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron importar las fuentes.");
    } finally {
      setSaving(false);
    }
  }

  if (activeNotebook) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={returnToGallery}>
            <ArrowLeft /> Todos los cuadernos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void deleteNotebook(activeNotebook)}
            aria-label={`Eliminar el cuaderno ${activeNotebook.title}`}
          >
            <Trash2 className="text-rose-400" /> Eliminar cuaderno
          </Button>
        </div>

        <header className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5 sm:p-6">
          {editingNotebookTitle ? (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (titleDraft.trim()) void saveNotebook({ title: titleDraft.trim() });
              }}
            >
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                maxLength={120}
                required
                aria-label="Título del cuaderno"
                className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#101012] px-3 py-2 text-lg font-semibold text-white outline-none focus:border-emerald-500/40"
              />
              <Button type="submit" disabled={saving}><Save /> Guardar</Button>
              <Button type="button" variant="ghost" onClick={() => { setEditingNotebookTitle(false); setTitleDraft(activeNotebook.title); }}>
                <X /> Cancelar
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 shrink-0 text-emerald-300" />
              <h2 className="min-w-0 flex-1 truncate text-xl font-semibold text-white">{activeNotebook.title}</h2>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditingNotebookTitle(true)} aria-label="Editar título del cuaderno">
                <Pencil />
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs text-zinc-500">{documents.length} fuente(s) · Las menciones y recetas usarán este cuaderno activo.</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#141414] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Fuentes</h3>
                <p className="mt-1 text-xs text-zinc-500">Markdown, PDF, Word (.docx/.word) y HTML; límite de 1 MB por archivo.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={saving}>
                  {saving ? <LoaderCircle className="animate-spin" /> : <Upload />} Agregar fuentes
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".md,.pdf,.docx,.word,.html,.htm,text/markdown,application/pdf,text/html"
                  multiple
                  className="sr-only"
                  onChange={importSources}
                  disabled={saving}
                />
              </div>
            </div>

            {showSourceEditor && (
              <form onSubmit={saveSource} className="space-y-3 rounded-xl border border-white/[0.08] bg-[#101012] p-3">
                <input
                  value={sourceTitle}
                  onChange={(event) => setSourceTitle(event.target.value)}
                  placeholder="Nombre de la fuente"
                  maxLength={240}
                  required
                  className="w-full rounded-lg border border-white/[0.1] bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/40"
                />
                <textarea
                  value={sourceContent}
                  onChange={(event) => setSourceContent(event.target.value)}
                  placeholder="# Nueva fuente&#10;&#10;Escribe o pega el contenido aquí."
                  rows={7}
                  maxLength={1_000_000}
                  required
                  className="w-full rounded-lg border border-white/[0.1] bg-black/20 p-3 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-emerald-500/40"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={saving}><Save /> {editingSourceId ? "Guardar cambios" : "Crear fuente"}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setShowSourceEditor(false); setEditingSourceId(null); }}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}

            {!showSourceEditor && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setShowSourceEditor(true); setSourceTitle(""); setSourceContent(""); setEditingSourceId(null); }}>
                <FilePlus2 /> Crear fuente de texto
              </Button>
            )}

            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] p-4 text-xs text-zinc-500">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Cargando fuentes…
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.1] p-6 text-center text-xs text-zinc-500">
                Aún no hay fuentes. Usa «Agregar fuentes» para comenzar.
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((document) => (
                  <article key={document.id} className="rounded-xl border border-white/[0.07] bg-[#101012] p-3">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-xs font-medium text-zinc-100">{document.moduleName}</h4>
                          <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-zinc-500">{formatSourceType(document)}</span>
                        </div>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] leading-5 text-zinc-500">{document.markdownContent.slice(0, 300)}</p>
                      </div>
                      {onAttach && <Button type="button" size="icon-sm" variant="ghost" onClick={() => onAttach(document)} aria-label={`Adjuntar ${document.moduleName}`} title="Adjuntar al chat"><Plus /></Button>}
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => editSource(document)} aria-label={`Editar ${document.moduleName}`}><Pencil /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" onClick={() => void deleteSource(document)} aria-label={`Eliminar ${document.moduleName}`}><Trash2 className="text-rose-400" /></Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#141414] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-amber-300" />
              <div>
                <h3 className="text-sm font-semibold text-white">Notas del cuaderno</h3>
                <p className="mt-1 text-xs text-zinc-500">Apuntes privados que puedes usar como guía del proyecto.</p>
              </div>
            </div>
            <textarea
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              maxLength={100_000}
              placeholder="Añade decisiones, preguntas o notas de investigación…"
              className="min-h-64 flex-1 resize-y rounded-xl border border-white/[0.08] bg-[#101012] p-3 text-xs leading-5 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/[0.2]"
            />
            <Button
              type="button"
              className="mt-3 self-start"
              disabled={saving || notesDraft === activeNotebook.notes}
              onClick={() => void saveNotebook({ notes: notesDraft })}
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar notas
            </Button>
          </section>
        </div>

        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#141414] p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Cuadernos de contexto</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Organiza fuentes, notas y conocimiento para inyectarlo según cada tarea.</p>
          </div>
        </div>
        <Button type="button" onClick={() => setShowCreateNotebook((shown) => !shown)}>
          {showCreateNotebook ? <X /> : <Plus />} Nuevo cuaderno
        </Button>
        {showCreateNotebook && (
          <form onSubmit={createNotebook} className="flex w-full flex-wrap gap-2 rounded-xl border border-white/[0.08] bg-[#101012] p-3">
            <input
              value={newNotebookTitle}
              onChange={(event) => setNewNotebookTitle(event.target.value)}
              placeholder="Nombre del cuaderno"
              maxLength={120}
              required
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/40"
            />
            <Button type="submit" disabled={saving || !newNotebookTitle.trim()}>{saving ? <LoaderCircle className="animate-spin" /> : <Plus />} Crear</Button>
          </form>
        )}
      </section>

      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#141414] p-5 text-xs text-zinc-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Cargando cuadernos…
        </div>
      ) : notebooks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.1] p-10 text-center">
          <BookOpen className="mx-auto h-7 w-7 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-300">Aún no tienes cuadernos.</p>
          <p className="mt-1 text-xs text-zinc-500">Crea uno para reunir fuentes y notas de trabajo.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notebooks.map((notebook) => (
            <article key={notebook.id} className="group relative rounded-2xl border border-white/[0.08] bg-[#141414] p-5 transition hover:border-white/[0.18] hover:bg-[#181818]">
              <button type="button" onClick={() => openNotebook(notebook)} className="block w-full text-left">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-emerald-300">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h3 className="mt-4 truncate pr-12 text-base font-semibold text-zinc-100">{notebook.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">{notebook._count?.documents ?? 0} fuentes</p>
                <p className="mt-4 line-clamp-2 min-h-9 whitespace-pre-wrap text-xs leading-5 text-zinc-500">
                  {notebook.notes || "Sin notas"}
                </p>
              </button>
              <div className="absolute right-3 top-3 flex gap-1 opacity-70 transition group-hover:opacity-100">
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => { openNotebook(notebook); setEditingNotebookTitle(true); }} aria-label={`Editar ${notebook.title}`}>
                  <Pencil />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => void deleteNotebook(notebook)} aria-label={`Eliminar ${notebook.title}`}>
                  <Trash2 className="text-rose-400" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
