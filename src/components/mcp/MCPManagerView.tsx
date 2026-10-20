"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";

type TransportKind = "stdio" | "sse";
type ServerStatus = "unknown" | "connected" | "disconnected" | "testing";

interface MCPServer {
  id: string;
  name: string;
  transport: TransportKind;
  enabled: boolean;
  command?: string;
  args?: string[];
  url?: string;
  envNames: string[];
  headerNames: string[];
  updatedAt: string;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

interface ServerForm {
  id?: string;
  name: string;
  transport: TransportKind;
  enabled: boolean;
  command: string;
  argsText: string;
  envText: string;
  url: string;
  headersText: string;
}

interface ToolOutput {
  serverId: string;
  toolName: string;
  result: string;
  isError: boolean;
}

const emptyForm: ServerForm = {
  name: "",
  transport: "stdio",
  enabled: true,
  command: "",
  argsText: "",
  envText: "",
  url: "",
  headersText: "",
};

export default function MCPManagerView({ onUseToolResult }: { onUseToolResult: (context: string) => void }) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [form, setForm] = useState<ServerForm>(emptyForm);
  const [toolsByServer, setToolsByServer] = useState<Record<string, MCPTool[]>>({});
  const [statusByServer, setStatusByServer] = useState<Record<string, ServerStatus>>({});
  const [toolArguments, setToolArguments] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadServers() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/mcp", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok || !isRecord(body) || !Array.isArray(body.servers)) {
        throw new Error(getErrorMessage(body, "No se pudieron cargar los servidores MCP."));
      }
      const nextServers = body.servers.filter(isMCPServer);
      setServers(nextServers);
      setToolsByServer((current) => Object.fromEntries(
        Object.entries(current).filter(([id]) => nextServers.some((server) => server.id === id)),
      ));
      setStatusByServer((current) => Object.fromEntries(
        nextServers.map((server) => [server.id, current[server.id] ?? "unknown"]),
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los servidores MCP.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadServers(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function editServer(server: MCPServer) {
    setError(null);
    setOutput(null);
    setForm({
      id: server.id,
      name: server.name,
      transport: server.transport,
      enabled: server.enabled,
      command: server.command ?? "",
      argsText: (server.args ?? []).join("\n"),
      envText: "",
      url: server.url ?? "",
      headersText: "",
    });
  }

  async function testServer(serverId?: string) {
    const targetId = serverId ?? form.id ?? "draft";
    setBusy(`test:${targetId}`);
    setError(null);
    setStatusByServer((current) => ({ ...current, [targetId]: "testing" }));
    try {
      const response = await apiFetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverId
          ? { action: "test", serverId }
          : { action: "test", draft: toServerPayload(form) }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isRecord(body) || !Array.isArray(body.tools)) {
        throw new Error(getErrorMessage(body, "No se pudo conectar con el servidor MCP."));
      }
      const tools = body.tools.filter(isMCPTool);
      setToolsByServer((current) => ({ ...current, [targetId]: tools }));
      setStatusByServer((current) => ({ ...current, [targetId]: "connected" }));
      if (!serverId) setOutput({ serverId: targetId, toolName: "test", result: `Conexión correcta: ${tools.length} herramientas disponibles.`, isError: false });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo conectar con el servidor MCP.";
      setStatusByServer((current) => ({ ...current, [targetId]: "disconnected" }));
      setError(message);
      if (!serverId) setOutput({ serverId: targetId, toolName: "test", result: message, isError: true });
    } finally {
      setBusy(null);
    }
  }

  async function saveServer() {
    setBusy("save");
    setError(null);
    try {
      const response = await apiFetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", server: toServerPayload(form) }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isRecord(body) || !isMCPServer(body.server)) {
        throw new Error(getErrorMessage(body, "No se pudo guardar el servidor MCP."));
      }
      const server = body.server;
      setServers((current) => current.some((item) => item.id === server.id)
        ? current.map((item) => item.id === server.id ? server : item)
        : [...current, server]);
      setForm(emptyForm);
      setOutput(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el servidor MCP.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteServer(server: MCPServer) {
    if (!window.confirm(`¿Eliminar el servidor MCP "${server.name}" y su configuración local?`)) return;
    setBusy(`delete:${server.id}`);
    setError(null);
    try {
      const response = await apiFetch("/api/mcp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: server.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body, "No se pudo eliminar el servidor MCP."));
      setServers((current) => current.filter((item) => item.id !== server.id));
      setToolsByServer((current) => omitKey(current, server.id));
      setStatusByServer((current) => omitKey(current, server.id));
      if (form.id === server.id) setForm(emptyForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el servidor MCP.");
    } finally {
      setBusy(null);
    }
  }

  async function invokeTool(server: MCPServer, tool: MCPTool) {
    const key = `${server.id}:${tool.name}`;
    let args: unknown;
    try {
      args = JSON.parse(toolArguments[key] || "{}");
    } catch {
      setError(`Los argumentos para "${tool.name}" deben ser JSON válido.`);
      return;
    }
    if (!isRecord(args)) {
      setError("Los argumentos de herramienta deben ser un objeto JSON.");
      return;
    }
    const argsSummary = JSON.stringify(args, null, 2);
    if (!window.confirm(`¿Autorizar esta invocación MCP?\n\nServidor: ${server.name}\nHerramienta: ${tool.name}\nArgumentos:\n${argsSummary.slice(0, 3000)}`)) return;
    setBusy(`invoke:${key}`);
    setError(null);
    setOutput(null);
    try {
      const approvalResponse = await apiFetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "authorize",
          serverId: server.id,
          toolName: tool.name,
          arguments: args,
        }),
      });
      const approvalBody: unknown = await approvalResponse.json();
      if (!approvalResponse.ok || !isRecord(approvalBody) || typeof approvalBody.approvalId !== "string") {
        throw new Error(getErrorMessage(approvalBody, "No se pudo registrar la aprobación MCP."));
      }
      const response = await apiFetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invoke",
          serverId: server.id,
          toolName: tool.name,
          arguments: args,
          approvalId: approvalBody.approvalId,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isRecord(body) || typeof body.result !== "string") {
        throw new Error(getErrorMessage(body, "La herramienta MCP falló."));
      }
      setOutput({ serverId: server.id, toolName: tool.name, result: body.result, isError: body.isError === true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "La herramienta MCP falló.";
      setOutput({ serverId: server.id, toolName: tool.name, result: message, isError: true });
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="grid gap-6 text-zinc-100 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-blue-300" />
                <h2 className="text-sm font-semibold text-white">{form.id ? "Editar servidor MCP" : "Registrar servidor MCP"}</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Conecta herramientas locales por stdio o endpoints MCP SSE.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadServers()} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Actualizar
            </Button>
          </div>

          <div className="space-y-3">
            <label className="grid gap-1.5 text-xs text-zinc-300">
              Nombre del servidor
              <input value={form.name} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none focus:border-blue-500/50" placeholder="Filesystem local" />
            </label>
            <label className="grid gap-1.5 text-xs text-zinc-300">
              Transporte
              <select value={form.transport} onChange={(event) => setForm((current) => ({ ...current, transport: event.target.value as TransportKind }))} className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none focus:border-blue-500/50">
                <option value="stdio">stdio · proceso local</option>
                <option value="sse">SSE · endpoint HTTP</option>
              </select>
            </label>
            {form.transport === "stdio" ? (
              <>
                <label className="grid gap-1.5 text-xs text-zinc-300">
                  Ejecutable
                  <input value={form.command} maxLength={512} onChange={(event) => setForm((current) => ({ ...current, command: event.target.value }))} className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 font-mono text-sm text-zinc-100 outline-none focus:border-blue-500/50" placeholder="npx" />
                </label>
                <label className="grid gap-1.5 text-xs text-zinc-300">
                  Argumentos (uno por línea)
                  <textarea value={form.argsText} onChange={(event) => setForm((current) => ({ ...current, argsText: event.target.value }))} rows={3} className="rounded-lg border border-white/[0.1] bg-[#101012] p-3 font-mono text-xs text-zinc-100 outline-none focus:border-blue-500/50" placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/Users/usuario/proyecto"} />
                </label>
                <label className="grid gap-1.5 text-xs text-zinc-300">
                  Variables de entorno secretas (JSON)
                  <textarea value={form.envText} onChange={(event) => setForm((current) => ({ ...current, envText: event.target.value }))} rows={2} className="rounded-lg border border-white/[0.1] bg-[#101012] p-3 font-mono text-xs text-zinc-100 outline-none focus:border-blue-500/50" placeholder={form.id ? "Vacío conserva las variables existentes" : '{"API_TOKEN":"…"}'} />
                  {form.id && form.transport === "stdio" && servers.find((server) => server.id === form.id)?.envNames.length ? <span className="text-[10px] text-zinc-500">Variables guardadas: {servers.find((server) => server.id === form.id)?.envNames.join(", ")}. Deja vacío para conservarlas.</span> : null}
                </label>
              </>
            ) : (
              <>
                <label className="grid gap-1.5 text-xs text-zinc-300">
                  Endpoint SSE
                  <input type="url" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none focus:border-blue-500/50" placeholder="http://127.0.0.1:8000/sse" />
                </label>
                <label className="grid gap-1.5 text-xs text-zinc-300">
                  Encabezados HTTP / tokens (JSON)
                  <textarea value={form.headersText} onChange={(event) => setForm((current) => ({ ...current, headersText: event.target.value }))} rows={3} className="rounded-lg border border-white/[0.1] bg-[#101012] p-3 font-mono text-xs text-zinc-100 outline-none focus:border-blue-500/50" placeholder={form.id ? "Vacío conserva los encabezados existentes" : '{"Authorization":"Bearer …"}'} />
                  {form.id && servers.find((server) => server.id === form.id)?.headerNames.length ? <span className="text-[10px] text-zinc-500">Encabezados guardados: {servers.find((server) => server.id === form.id)?.headerNames.join(", ")}. Deja vacío para conservarlos.</span> : null}
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 accent-blue-500" />
              Activar herramientas en el entorno de PulseStudio
            </label>
            {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => void testServer(form.id)} disabled={busy !== null}>
                {busy?.startsWith("test:") ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
                Probar y descubrir herramientas
              </Button>
              <Button type="button" onClick={() => void saveServer()} disabled={busy !== null}>
                {busy === "save" ? <LoaderCircle className="animate-spin" /> : <Save />}
                Guardar servidor
              </Button>
              {form.id && <Button type="button" variant="ghost" onClick={() => { setForm(emptyForm); setError(null); }}><X />Cancelar</Button>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-xs leading-5 text-amber-100">
          <div className="flex items-start gap-2"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <p>Los comandos stdio ejecutan procesos locales y las herramientas MCP pueden modificar datos. Revisa el comando, servidor y argumentos antes de guardar o aprobar una invocación. En modo web la configuración se guarda localmente sin cifrado del sistema operativo; no uses secretos sensibles en un entorno compartido.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Servidores registrados</h2>
          {loading && <p className="text-xs text-zinc-500">Cargando servidores MCP…</p>}
          {!loading && servers.length === 0 && <p className="rounded-xl border border-dashed border-white/[0.1] p-4 text-xs text-zinc-500">Aún no hay servidores registrados.</p>}
          <div className="space-y-3">
            {servers.map((server) => {
              const status = statusByServer[server.id] ?? "unknown";
              const statusColor = status === "connected" ? "text-emerald-300" : status === "testing" ? "text-amber-300" : status === "disconnected" ? "text-rose-300" : "text-zinc-500";
              return (
                <article key={server.id} className="rounded-xl border border-white/[0.08] bg-[#101012] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-zinc-100">{server.name}</h3>
                      <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">{server.transport === "stdio" ? `${server.command} ${(server.args ?? []).join(" ")}` : server.url}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${statusColor}`}>
                      {status === "testing" ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <span className={`h-1.5 w-1.5 rounded-full ${status === "connected" ? "bg-emerald-400" : status === "disconnected" ? "bg-rose-400" : "bg-zinc-600"}`} />}
                      {status === "connected" ? "Conectado" : status === "testing" ? "Probando" : "Desconectado"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void testServer(server.id)} disabled={busy !== null}>
                      {busy === `test:${server.id}` ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Probar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => editServer(server)}><Save />Editar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void deleteServer(server)} disabled={busy !== null} aria-label={`Eliminar ${server.name}`}><Trash2 /></Button>
                    {!server.enabled && <span className="self-center text-[10px] text-amber-300">Desactivado</span>}
                  </div>
                  {toolsByServer[server.id]?.length ? (
                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Herramientas ({toolsByServer[server.id].length})</h4>
                      <div className="space-y-3">
                        {toolsByServer[server.id].map((tool) => {
                          const key = `${server.id}:${tool.name}`;
                          return (
                            <div key={tool.name} className="rounded-lg border border-white/[0.06] p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="break-all font-mono text-xs text-blue-200">{tool.name}</p>
                                  {tool.description && <p className="mt-1 text-[11px] leading-5 text-zinc-500">{tool.description}</p>}
                                </div>
                                <Button type="button" size="sm" onClick={() => void invokeTool(server, tool)} disabled={!server.enabled || busy !== null} title="Cada ejecución requiere confirmación explícita">
                                  {busy === `invoke:${key}` ? <LoaderCircle className="animate-spin" /> : <Play />} Invocar
                                </Button>
                              </div>
                              <textarea
                                value={toolArguments[key] ?? "{}"}
                                onChange={(event) => setToolArguments((current) => ({ ...current, [key]: event.target.value }))}
                                rows={2}
                                aria-label={`Argumentos JSON para ${tool.name}`}
                                className="mt-2 w-full rounded-md border border-white/[0.08] bg-black/20 p-2 font-mono text-[10px] text-zinc-300 outline-none focus:border-blue-500/40"
                                placeholder="Argumentos JSON"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        {output && (
          <div className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className={`text-sm font-semibold ${output.isError ? "text-rose-200" : "text-emerald-200"}`}>
                {output.toolName === "test" ? "Prueba de conexión" : `Resultado · ${output.toolName}`}
              </h2>
              <button type="button" onClick={() => setOutput(null)} aria-label="Cerrar resultado" className="text-zinc-500 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs leading-5 text-zinc-300">{output.result}</pre>
            {output.toolName !== "test" && !output.isError && (
              <Button
                type="button"
                size="sm"
                className="mt-3"
                onClick={() => onUseToolResult(
                  `Resultado MCP aprobado del servidor ${servers.find((server) => server.id === output.serverId)?.name ?? output.serverId}, herramienta ${output.toolName}:\n${output.result}`,
                )}
              >
                Usar como contexto en Chat y Action Agent
              </Button>
            )}
          </div>
        )}
        {servers.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[11px] leading-5 text-zinc-500">
            Los resultados seleccionados aquí pueden adjuntarse como contexto explícito a Chat y Action Agent. La ejecución siempre requiere aprobación en el panel.
          </div>
        )}
      </div>
    </section>
  );
}

function toServerPayload(form: ServerForm) {
  const payload: Record<string, unknown> = {
    ...(form.id ? { id: form.id } : {}),
    name: form.name,
    transport: form.transport,
    enabled: form.enabled,
  };
  if (form.transport === "stdio") {
    payload.command = form.command;
    payload.args = form.argsText.split(/\r?\n/).map((argument) => argument.trim()).filter(Boolean);
    if (form.envText.trim()) payload.env = parseStringRecord(form.envText, "Las variables de entorno deben ser JSON válido.");
  } else {
    payload.url = form.url;
    if (form.headersText.trim()) payload.headers = parseStringRecord(form.headersText, "Los encabezados deben ser JSON válido.");
  }
  return payload;
}

function parseStringRecord(text: string, errorMessage: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(errorMessage);
  }
  if (!isRecord(parsed) || Object.values(parsed).some((value) => typeof value !== "string")) {
    throw new Error(errorMessage);
  }
  return parsed as Record<string, string>;
}

function omitKey<T>(value: Record<string, T>, key: string): Record<string, T> {
  const next = { ...value };
  delete next[key];
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function isMCPServer(value: unknown): value is MCPServer {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.transport === "stdio" || value.transport === "sse") &&
    typeof value.enabled === "boolean" &&
    Array.isArray(value.envNames) &&
    value.envNames.every((name) => typeof name === "string") &&
    Array.isArray(value.headerNames) &&
    value.headerNames.every((name) => typeof name === "string") &&
    typeof value.updatedAt === "string";
}

function isMCPTool(value: unknown): value is MCPTool {
  return isRecord(value) &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    "inputSchema" in value;
}
