"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  GitBranch,
  KeyRound,
  LoaderCircle,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AlmConnectionInput,
  AlmConnectionMetadata,
  AlmPlatform,
  AlmTestResult,
} from "@/types/electron";

interface ConnectionForm {
  id?: string;
  platform: AlmPlatform;
  name: string;
  baseUrl: string;
  token: string;
}

const EMPTY_FORM: ConnectionForm = {
  platform: "azure-devops",
  name: "",
  baseUrl: "",
  token: "",
};

function formFingerprint(form: ConnectionForm): string {
  return JSON.stringify([
    form.id ?? "",
    form.platform,
    form.name.trim(),
    form.baseUrl.trim(),
    form.token,
  ]);
}

export default function AlmSettingsView() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [connections, setConnections] = useState<AlmConnectionMetadata[]>([]);
  const [form, setForm] = useState<ConnectionForm>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<AlmTestResult | null>(null);
  const [testedFingerprint, setTestedFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"test" | "save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { canSave, formValid } = useMemo(() => {
    const currentFingerprint = formFingerprint(form);
    const formValid = Boolean(
      form.name.trim() &&
      form.baseUrl.trim() &&
      (form.token.trim() || form.id),
    );
    return {
      formValid,
      canSave:
        isDesktop &&
        !busy &&
        formValid &&
        testResult?.success === true &&
        testedFingerprint === currentFingerprint,
    };
  }, [busy, form, isDesktop, testResult, testedFingerprint]);

  const loadConnections = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.almLoadConnections();
      if (!result.success) throw new Error(result.error ?? "No se pudieron cargar las conexiones.");
      setConnections(result.connections);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las conexiones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const desktopAvailable = Boolean(window.electronAPI?.isElectron);
      setIsDesktop(desktopAvailable);
      if (desktopAvailable) void loadConnections();
      else setLoading(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadConnections]);

  function updateForm(next: Partial<ConnectionForm>) {
    setForm((current) => ({ ...current, ...next }));
    setTestResult(null);
    setTestedFingerprint(null);
    setError(null);
  }

  function selectConnection(connection: AlmConnectionMetadata) {
    setForm({
      id: connection.id,
      platform: connection.platform,
      name: connection.name,
      baseUrl: connection.baseUrl,
      token: "",
    });
    setTestResult(null);
    setTestedFingerprint(null);
    setError(null);
  }

  function startNewConnection() {
    setForm(EMPTY_FORM);
    setTestResult(null);
    setTestedFingerprint(null);
    setError(null);
  }

  async function testConnection() {
    const api = window.electronAPI;
    if (!api) return;
    setBusy("test");
    setError(null);
    setTestResult(null);
    setTestedFingerprint(null);
    try {
      const input: AlmConnectionInput = {
        ...(form.id ? { id: form.id } : {}),
        platform: form.platform,
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        token: form.token.trim(),
      };
      const result = await api.almTestConnection(input);
      setTestResult(result);
      if (result.success) setTestedFingerprint(formFingerprint(form));
    } catch (cause) {
      setTestResult({
        success: false,
        readAccess: false,
        writeAccess: false,
        message: cause instanceof Error ? cause.message : "No se pudo probar la conexión.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveConnection() {
    const api = window.electronAPI;
    if (!api || !canSave) return;
    setBusy("save");
    setError(null);
    try {
      const input: AlmConnectionInput = {
        ...(form.id ? { id: form.id } : {}),
        platform: form.platform,
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        token: form.token.trim(),
      };
      const result = await api.almSaveConnection(input);
      if (!result.success || !result.connection) {
        throw new Error(result.error ?? "No se pudo guardar la conexión.");
      }
      const saved = result.connection;
      setConnections((previous) => [
        saved,
        ...previous.filter((connection) => connection.id !== saved.id),
      ]);
      setForm({
        id: saved.id,
        platform: saved.platform,
        name: saved.name,
        baseUrl: saved.baseUrl,
        token: "",
      });
      setTestResult(null);
      setTestedFingerprint(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la conexión.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteConnection(connection: AlmConnectionMetadata) {
    const api = window.electronAPI;
    if (!api || !window.confirm(`¿Eliminar la conexión "${connection.name}" y su token cifrado?`)) return;
    setBusy("delete");
    setError(null);
    try {
      const result = await api.almDeleteConnection(connection.id);
      if (!result.success) throw new Error(result.error ?? "No se pudo eliminar la conexión.");
      setConnections((previous) => previous.filter((item) => item.id !== connection.id));
      if (form.id === connection.id) startNewConnection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la conexión.");
    } finally {
      setBusy(null);
    }
  }

  const urlPlaceholder = form.platform === "azure-devops"
    ? "https://dev.azure.com/mi-organizacion"
    : "https://mi-equipo.atlassian.net";

  return (
    <section className="space-y-6 text-zinc-100">
      {!isDesktop && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            El almacenamiento seguro de credenciales sólo está disponible en la aplicación de escritorio.
            Abre PulseStudio con Electron para probar y guardar conexiones; el token no se guardará en el navegador.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
        <div className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5 sm:p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Nueva conexión ALM</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Valida permisos de lectura y escritura antes de guardar.
              </p>
            </div>
            {form.id && (
              <Button type="button" variant="outline" size="sm" onClick={startNewConnection}>
                <Plus />
                Nueva
              </Button>
            )}
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void testConnection();
            }}
          >
            <label className="grid gap-1.5 text-xs text-zinc-300">
              Plataforma
              <select
                value={form.platform}
                onChange={(event) => {
                  const platform = event.target.value as AlmPlatform;
                  updateForm({
                    platform,
                    id: undefined,
                    name: "",
                    baseUrl: "",
                    token: "",
                  });
                }}
                disabled={!isDesktop || busy !== null}
                className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none focus:border-emerald-500/50 disabled:opacity-50"
              >
                <option value="azure-devops">Azure DevOps</option>
                <option value="jira">Jira</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-xs text-zinc-300">
              Nombre de la conexión
              <input
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="Proyecto Banco BHD"
                maxLength={100}
                required
                disabled={!isDesktop || busy !== null}
                className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
              />
            </label>

            <label className="grid gap-1.5 text-xs text-zinc-300">
              URL base de la organización o instancia
              <input
                type="url"
                value={form.baseUrl}
                onChange={(event) => updateForm({ baseUrl: event.target.value })}
                placeholder={urlPlaceholder}
                required
                disabled={!isDesktop || busy !== null}
                className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
              />
              <span className="text-[10px] text-zinc-600">Se requiere HTTPS.</span>
            </label>

            <label className="grid gap-1.5 text-xs text-zinc-300">
              Token de acceso personal / Bearer Token
              <input
                type="password"
                value={form.token}
                onChange={(event) => updateForm({ token: event.target.value })}
                placeholder={form.id ? "Vacío para conservar el token cifrado actual" : "Pega el token de acceso"}
                autoComplete="new-password"
                required={!form.id}
                disabled={!isDesktop || busy !== null}
                className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
              />
              <span className="text-[10px] text-zinc-600">
                Nunca se escribe en localStorage, la base SQLite ni los registros de actividad.
              </span>
            </label>

            {testResult && (
              <div className={`rounded-xl border p-3 ${
                testResult.success
                  ? "border-emerald-500/25 bg-emerald-500/[0.07]"
                  : "border-rose-500/25 bg-rose-500/[0.07]"
              }`}>
                <div className="flex items-start gap-2">
                  {testResult.success
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />}
                  <div>
                    <p className={`text-xs font-medium ${testResult.success ? "text-emerald-200" : "text-rose-200"}`}>
                      {testResult.success ? "Conexión validada" : "No se pudo validar"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-300">{testResult.message}</p>
                    <div className="mt-2 flex gap-3 text-[10px]">
                      <span className={testResult.readAccess ? "text-emerald-300" : "text-rose-300"}>
                        Lectura: {testResult.readAccess ? "confirmada" : "no confirmada"}
                      </span>
                      <span className={testResult.writeAccess ? "text-emerald-300" : "text-rose-300"}>
                        Escritura: {testResult.writeAccess ? "confirmada" : "no confirmada"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="submit"
                variant="outline"
                disabled={!isDesktop || busy !== null || !formValid}
              >
                {busy === "test" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                Probar conexión
              </Button>
              <Button
                type="button"
                onClick={() => void saveConnection()}
                disabled={!canSave}
              >
                {busy === "save" ? <LoaderCircle className="animate-spin" /> : <Save />}
                Guardar cifrada
              </Button>
            </div>
            <p className="text-[10px] leading-4 text-zinc-600">
              La comprobación usa endpoints de sólo lectura para consultar la identidad, los proyectos
              y los permisos. No crea ni modifica elementos en Azure DevOps o Jira.
            </p>
          </form>
        </div>

        <aside className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Conexiones guardadas</h2>
              <p className="mt-1 text-xs text-zinc-500">Los tokens se descifran sólo en el proceso principal.</p>
            </div>
            {loading && <LoaderCircle className="h-4 w-4 animate-spin text-zinc-500" />}
          </div>

          {connections.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] p-5 text-center">
              <KeyRound className="mx-auto h-5 w-5 text-zinc-600" />
              <p className="mt-2 text-xs text-zinc-500">Todavía no hay conexiones ALM guardadas.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className={`flex items-start gap-2 rounded-xl border p-3 ${
                    form.id === connection.id
                      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                      : "border-white/[0.08] bg-[#101012]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectConnection(connection)}
                    disabled={busy !== null}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                      {connection.platform === "jira" ? "Jira" : "Azure DevOps"}
                      <span className="h-1 w-1 rounded-full bg-zinc-600" />
                      <span className="truncate">{connection.name}</span>
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-zinc-500">{connection.baseUrl}</span>
                    <span className="mt-1 block text-[9px] text-zinc-600">
                      Token {connection.hasToken ? "cifrado y guardado" : "no disponible"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteConnection(connection)}
                    disabled={busy !== null}
                    aria-label={`Eliminar conexión ${connection.name}`}
                    title="Eliminar conexión y token"
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 rounded-xl border border-white/[0.06] bg-[#101012] p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Cifrado local del sistema operativo
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-zinc-500">
              Electron safeStorage cifra el archivo de credenciales usando el almacén seguro disponible
              en el equipo. El proceso de renderizado sólo recibe metadatos, nunca los tokens guardados.
            </p>
          </div>
          {form.platform === "azure-devops" && (
            <a
              href="https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              Documentación de PAT de Azure DevOps <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </aside>
      </div>
    </section>
  );
}
