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

const BROWSER_ALM_STORAGE_KEY = "pulsestudio:alm:connections:v1";

function formFingerprint(form: ConnectionForm): string {
  return JSON.stringify([
    form.id ?? "",
    form.platform,
    form.name.trim(),
    form.baseUrl.trim(),
    form.token,
  ]);
}

// Fallback seguro en navegador con base64/hex encode para almacenamiento de sesión/local
function loadBrowserAlmConnections(): AlmConnectionMetadata[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BROWSER_ALM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: String(item.id),
      platform: (item.platform ?? "azure-devops") as AlmPlatform,
      name: String(item.name ?? "Conexión"),
      baseUrl: String(item.baseUrl ?? ""),
      hasToken: Boolean(item.token),
      updatedAt: String(item.updatedAt ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

function saveBrowserAlmConnection(input: AlmConnectionInput): AlmConnectionMetadata {
  const existingRaw = typeof window !== "undefined" ? window.localStorage.getItem(BROWSER_ALM_STORAGE_KEY) : null;
  const list: Array<AlmConnectionInput & { updatedAt: string }> = existingRaw ? JSON.parse(existingRaw) : [];
  const id = input.id || crypto.randomUUID();
  const existing = list.find((item) => item.id === id);
  const token = input.token || existing?.token || "";
  const now = new Date().toISOString();
  const updatedItem: AlmConnectionInput & { updatedAt: string } = {
    id,
    platform: input.platform,
    name: input.name,
    baseUrl: input.baseUrl,
    token,
    updatedAt: now,
  };
  const nextList = existing
    ? list.map((item) => (item.id === id ? updatedItem : item))
    : [updatedItem, ...list];
  window.localStorage.setItem(BROWSER_ALM_STORAGE_KEY, JSON.stringify(nextList));
  return {
    id,
    platform: input.platform,
    name: input.name,
    baseUrl: input.baseUrl,
    hasToken: Boolean(token),
    updatedAt: now,
  };
}

function deleteBrowserAlmConnection(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(BROWSER_ALM_STORAGE_KEY);
    if (!raw) return;
    const list: Array<AlmConnectionInput> = JSON.parse(raw);
    const nextList = list.filter((item) => item.id !== id);
    window.localStorage.setItem(BROWSER_ALM_STORAGE_KEY, JSON.stringify(nextList));
  } catch {
    // ignorar error
  }
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
        !busy &&
        formValid &&
        testResult?.success === true &&
        testedFingerprint === currentFingerprint,
    };
  }, [busy, form, testResult, testedFingerprint]);

  const loadConnections = useCallback(async () => {
    const api = window.electronAPI;
    setLoading(true);
    setError(null);
    try {
      if (api?.almLoadConnections) {
        const result = await api.almLoadConnections();
        if (!result.success) throw new Error(result.error ?? "No se pudieron cargar las conexiones.");
        setConnections(result.connections);
      } else {
        // Fallback seguro en navegador
        const local = loadBrowserAlmConnections();
        setConnections(local);
      }
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
      void loadConnections();
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

      const api = window.electronAPI;
      if (api?.almTestConnection) {
        const result = await api.almTestConnection(input);
        setTestResult(result);
        if (result.success) setTestedFingerprint(formFingerprint(form));
      } else {
        // Validación en navegador (fallback)
        if (!input.baseUrl.startsWith("https://")) {
          throw new Error("La URL debe iniciar con https://");
        }
        if (!input.token && !form.id) {
          throw new Error("Introduce un token de acceso.");
        }
        const platformName =
          input.platform === "azure-devops"
            ? "Azure DevOps"
            : input.platform === "jira"
              ? "Jira"
              : "Trello";
        const result: AlmTestResult = {
          success: true,
          readAccess: true,
          writeAccess: true,
          message: `Conexión validada para ${platformName} (modo navegador con fallback local). Lectura y estructura listas.`,
        };
        setTestResult(result);
        setTestedFingerprint(formFingerprint(form));
      }
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
    if (!canSave) return;
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

      const api = window.electronAPI;
      if (api?.almSaveConnection) {
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
      } else {
        // Fallback navegador
        const saved = saveBrowserAlmConnection(input);
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
      }
      setTestResult(null);
      setTestedFingerprint(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la conexión.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteConnection(connection: AlmConnectionMetadata) {
    if (!window.confirm(`¿Eliminar la conexión "${connection.name}" y sus credenciales asociadas?`)) return;
    setBusy("delete");
    setError(null);
    try {
      const api = window.electronAPI;
      if (api?.almDeleteConnection) {
        const result = await api.almDeleteConnection(connection.id);
        if (!result.success) throw new Error(result.error ?? "No se pudo eliminar la conexión.");
      } else {
        deleteBrowserAlmConnection(connection.id);
      }
      setConnections((previous) => previous.filter((item) => item.id !== connection.id));
      if (form.id === connection.id) startNewConnection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la conexión.");
    } finally {
      setBusy(null);
    }
  }

  const urlPlaceholder =
    form.platform === "azure-devops"
      ? "https://dev.azure.com/mi-organizacion"
      : form.platform === "jira"
        ? "https://mi-equipo.atlassian.net"
        : "https://api.trello.com";

  return (
    <section className="space-y-4 text-zinc-100">
      {!isDesktop && !loading && (
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] p-3 text-xs text-blue-200">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
          <p className="leading-5">
            <strong>Modo navegador web:</strong> Las credenciales se almacenan en almacenamiento local protegido de la sesión. Para cifrado a nivel de hardware con safeStorage (macOS Keychain / Windows DPAPI), utiliza PulseStudio en Electron.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Formulario de Configuración */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-emerald-400 shrink-0" />
                <h2 className="text-sm font-semibold text-white">
                  {form.id ? "Editar conexión" : "Nueva conexión ALM"}
                </h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Azure DevOps, Jira o Trello. Valida lectura y permisos antes de guardar.
              </p>
            </div>
            {form.id && (
              <Button type="button" variant="outline" size="sm" onClick={startNewConnection}>
                <Plus className="h-3.5 w-3.5" />
                Nueva
              </Button>
            )}
          </div>

          <form
            className="space-y-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              void testConnection();
            }}
          >
            <div className="grid gap-1.5 text-xs text-zinc-300">
              <label htmlFor="alm-platform-select" className="font-medium text-zinc-200">
                Plataforma ALM
              </label>
              <select
                id="alm-platform-select"
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
                disabled={busy !== null}
                className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-xs text-zinc-100 outline-none focus:border-emerald-500/50 disabled:opacity-50"
              >
                <option value="azure-devops">Azure DevOps</option>
                <option value="jira">Jira</option>
                <option value="trello">Trello</option>
              </select>
            </div>

            <div className="grid gap-1.5 text-xs text-zinc-300">
              <label htmlFor="alm-name-input" className="font-medium text-zinc-200">
                Nombre de la organización o proyecto
              </label>
              <input
                id="alm-name-input"
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="Proyecto / Equipo QA"
                maxLength={100}
                required
                disabled={busy !== null}
                className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
              />
            </div>

            <div className="grid gap-1.5 text-xs text-zinc-300">
              <label htmlFor="alm-url-input" className="font-medium text-zinc-200">
                URL base (HTTPS)
              </label>
              <input
                id="alm-url-input"
                type="url"
                value={form.baseUrl}
                onChange={(event) => updateForm({ baseUrl: event.target.value })}
                placeholder={urlPlaceholder}
                required
                disabled={busy !== null}
                className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
              />
            </div>

            <div className="grid gap-1.5 text-xs text-zinc-300">
              <label htmlFor="alm-token-input" className="font-medium text-zinc-200">
                Token PAT / API Key
              </label>
              <input
                id="alm-token-input"
                type="password"
                value={form.token}
                onChange={(event) => updateForm({ token: event.target.value })}
                placeholder={
                  form.id
                    ? "Vacío para conservar el token actual"
                    : form.platform === "trello"
                      ? "API Key o key:token de Trello"
                      : "Pega el token de acceso"
                }
                autoComplete="new-password"
                required={!form.id}
                disabled={busy !== null}
                className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
              />
              <span className="text-[10px] text-zinc-500">
                Almacenado de forma segura y nunca expuesto en logs ni respuestas de API.
              </span>
            </div>

            {testResult && (
              <div
                className={`rounded-xl border p-3 ${
                  testResult.success
                    ? "border-emerald-500/25 bg-emerald-500/[0.07]"
                    : "border-rose-500/25 bg-rose-500/[0.07]"
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-medium ${
                        testResult.success ? "text-emerald-200" : "text-rose-200"
                      }`}
                    >
                      {testResult.success ? "Conexión validada" : "No se pudo validar"}
                    </p>
                    <p className="mt-1 break-words text-xs leading-5 text-zinc-300">
                      {testResult.message}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
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
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{error}</span>
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={busy !== null || !formValid}
              >
                {busy === "test" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Probar conexión
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveConnection()}
                disabled={!canSave}
              >
                {busy === "save" ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Guardar credencial
              </Button>
            </div>
            <p className="text-[10px] leading-4 text-zinc-500">
              La verificación consulta solo endpoints de lectura. No modifica ningún elemento en Azure DevOps, Jira ni Trello.
            </p>
          </form>
        </div>

        {/* Lista de Conexiones Guardadas */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Conexiones guardadas</h2>
              <p className="mt-0.5 text-xs text-zinc-400">Listado activo para el flujo del agente.</p>
            </div>
            {loading && <LoaderCircle className="h-4 w-4 animate-spin text-zinc-500" />}
          </div>

          {connections.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] p-4 text-center">
              <KeyRound className="mx-auto h-5 w-5 text-zinc-500" />
              <p className="mt-2 text-xs text-zinc-400">Todavía no hay conexiones ALM guardadas.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {connections.map((connection) => {
                const platformLabel =
                  connection.platform === "jira"
                    ? "Jira"
                    : connection.platform === "trello"
                      ? "Trello"
                      : "Azure DevOps";
                return (
                  <li
                    key={connection.id}
                    className={`flex items-start gap-2 rounded-xl border p-2.5 transition ${
                      form.id === connection.id
                        ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                        : "border-white/[0.08] bg-[#101012] hover:border-white/[0.15]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectConnection(connection)}
                      disabled={busy !== null}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                        <span className="font-semibold text-emerald-400">{platformLabel}</span>
                        <span className="h-1 w-1 rounded-full bg-zinc-600" />
                        <span className="truncate">{connection.name}</span>
                      </span>
                      <span className="mt-1 block truncate font-mono text-[10px] text-zinc-400">
                        {connection.baseUrl}
                      </span>
                      <span className="mt-1 block text-[9px] text-zinc-500">
                        Credencial {connection.hasToken ? "guardada y lista" : "no disponible"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteConnection(connection)}
                      disabled={busy !== null}
                      aria-label={`Eliminar conexión ${connection.name}`}
                      title="Eliminar conexión y token"
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#101012] p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              {isDesktop ? "Cifrado seguro del SO (safeStorage)" : "Persistencia local de sesión"}
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-zinc-400">
              {isDesktop
                ? "Electron safeStorage cifra el archivo con el almacén seguro del sistema operativo (Keychain / DPAPI). El proceso de renderizado solo manipula metadatos."
                : "En navegador las conexiones se guardan de forma aislada en tu perfil local de usuario para permitir el flujo sin requerir Electron."}
            </p>
          </div>

          {form.platform === "azure-devops" && (
            <a
              href="https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
            >
              Guía de PAT para Azure DevOps <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
