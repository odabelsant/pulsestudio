"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { getModuleHref } from "@/components/workspace/modules";
import { saveWorkspaceTheme, useWorkspaceTheme, type Theme } from "@/components/workspace/ThemeProvider";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function WorkspaceSettingsView() {
  const router = useRouter();
  const theme = useWorkspaceTheme();
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/workspace", { signal, cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok || !isRecord(data)) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "No se pudo leer el workspace.");
      }
      setWorkspaceRoot(typeof data.workspace === "string" ? data.workspace : null);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "No se pudo leer el workspace.");
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

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 p-5 sm:p-8">
      <header>
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E85D5D]">
          PulseStudio · Preferencias
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#E8F0F3] sm:text-3xl">Configuración</h1>
        <p className="mt-2 text-sm leading-6 text-[#A6B5BE]">
          Ajustes generales del cliente. Las credenciales y conexiones externas se gestionan en módulos dedicados.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-[#223039] bg-[#10181D] p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[#E8F0F3]">Apariencia</h2>
        <p className="mt-1 text-xs text-[#758792]">El tema se guarda en este navegador.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={theme === "dark" ? "default" : "outline"}
            onClick={() => saveWorkspaceTheme("dark")}
          >
            <Moon className="mr-2 h-4 w-4" />
            Oscuro
          </Button>
          <Button
            type="button"
            variant={theme === "light" ? "default" : "outline"}
            onClick={() => saveWorkspaceTheme("light")}
          >
            <Sun className="mr-2 h-4 w-4" />
            Claro
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#223039] bg-[#10181D] p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[#E8F0F3]">Workspace activo</h2>
        <p className="mt-1 text-xs text-[#758792]">Ruta raíz usada por el IDE integrado y el Runner.</p>
        <p className="mt-3 break-all rounded-lg border border-[#30434D] bg-[#0A1014] px-3 py-2 font-mono text-xs text-[#E8F0F3]">
          {loading ? "Cargando…" : workspaceRoot ?? "No configurado"}
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" disabled={loading} onClick={() => void refresh()}>
          Actualizar
        </Button>
      </section>

      <section className="rounded-2xl border border-[#223039] bg-[#10181D] p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[#E8F0F3]">Integraciones y secretos</h2>
        <p className="mt-1 text-xs text-[#758792]">
          Las escrituras en Azure DevOps y Jira permanecen deshabilitadas. Aquí sólo se abren los paneles de configuración local.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/?section=env")}>
            Variables de entorno
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/?section=alm")}>
            Conexiones ALM
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/?section=mcp")}>
            Servidores MCP
          </Button>
        </div>
        <p className="mt-4 text-[11px] text-[#758792]">
          También puedes abrir{" "}
          <Link href={getModuleHref("historial")} className="text-[#E8F0F3] underline-offset-2 hover:underline">
            Historial
          </Link>{" "}
          para revisar auditoría local.
        </p>
      </section>
    </section>
  );
}
