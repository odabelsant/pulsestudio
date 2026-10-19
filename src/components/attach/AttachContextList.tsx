"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FolderUp, LoaderCircle, Paperclip } from "lucide-react";

type ContextDocument = {
  id: string;
  projectName: string;
  moduleName: string;
  markdownContent: string;
};

export default function AttachContextList({
  onAttach,
  onError,
}: {
  onAttach: (doc: ContextDocument) => void
  onError?: (message: string) => void
}) {
  const [docs, setDocs] = useState<ContextDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("Proyecto actual");
  const [importing, setImporting] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/context')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load context documents.')
        }
        const data = await response.json() as ContextDocument[]
        setDocs(data)
      })
      .catch((error) => {
        setDocs([])
        onError?.(error.message || 'Unable to load context documents.')
      })
      .finally(() => setLoading(false))
  }, [onError]);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    setImporting(true);
    try {
      const form = new FormData();
      form.set("projectName", projectName);
      form.set("paths", JSON.stringify(files.map((file) => file.webkitRelativePath || file.name)));
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/context/import", { method: "POST", body: form });
      const data = await response.json() as { documents?: ContextDocument[]; error?: string };
      if (!response.ok || !data.documents) throw new Error(data.error || "No se pudieron importar los archivos.");
      setDocs((current) => [...data.documents!, ...current]);
      data.documents.forEach(onAttach);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "No se pudieron importar los archivos.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/[0.08] bg-[#151515] p-4">
        <p className="text-sm font-medium text-white">Importar archivos o carpeta</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">Los archivos de texto, Markdown, PDF, Word y HTML se convierten en contexto. Máximo 80 archivos, 1 MB por archivo y 8 MB por carga.</p>
        <label className="mt-3 grid gap-1 text-xs text-slate-400">
          Nombre del proyecto
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={120} className="rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
            {importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Archivos
            <input type="file" multiple className="sr-only" onChange={importFiles} disabled={importing} accept=".css,.csv,.docx,.env,.html,.htm,.java,.js,.json,.jsx,.md,.mdx,.pdf,.php,.py,.rb,.rs,.sh,.sql,.svg,.text,.toml,.ts,.tsx,.txt,.vue,.word,.xml,.yaml,.yml" />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.08]">
            <FolderUp className="h-4 w-4" /> Carpeta
            <input ref={folderInput} type="file" multiple className="sr-only" onChange={importFiles} disabled={importing} />
          </label>
        </div>
      </div>
      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          Loading context documents...
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          No context documents found. Add one on the Context page to attach it here.
        </div>
      ) : (
        docs.map((d) => (
          <div key={d.id} className="flex flex-col gap-3 rounded border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-white">{d.projectName} / {d.moduleName}</div>
                <div className="text-sm text-slate-400">{d.markdownContent?.slice(0, 200)}</div>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => onAttach(d)} name="Contexto">Attach</Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
