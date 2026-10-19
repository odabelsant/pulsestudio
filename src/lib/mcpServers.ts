import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER_STORE = path.join(process.cwd(), "data", "mcp-servers.json");
const CONNECT_TIMEOUT_MS = 10_000;
const TOOL_TIMEOUT_MS = 30_000;
const MAX_SERVERS = 50;
const MAX_TOOLS = 100;
const MAX_RESULT_CHARS = 50_000;

export type MCPTransportKind = "stdio" | "sse";

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransportKind;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  updatedAt: string;
}

export interface MCPToolSummary {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface MCPServerView {
  id: string;
  name: string;
  transport: MCPTransportKind;
  enabled: boolean;
  command?: string;
  args?: string[];
  url?: string;
  envNames: string[];
  headerNames: string[];
  updatedAt: string;
}

export function publicMCPServer(server: MCPServerConfig): MCPServerView {
  return {
    id: server.id,
    name: server.name,
    transport: server.transport,
    enabled: server.enabled,
    ...(server.command ? { command: server.command } : {}),
    ...(server.args ? { args: server.args } : {}),
    ...(server.url ? { url: server.url } : {}),
    envNames: Object.keys(server.env ?? {}),
    headerNames: Object.keys(server.headers ?? {}),
    updatedAt: server.updatedAt,
  };
}

export function normalizeMCPServer(value: unknown, existing?: MCPServerConfig): MCPServerConfig {
  if (!isRecord(value)) throw new Error("La configuración del servidor MCP no es válida.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 100) throw new Error("El nombre debe tener entre 1 y 100 caracteres.");
  if (value.transport !== "stdio" && value.transport !== "sse") {
    throw new Error("Selecciona un transporte stdio o SSE.");
  }
  const id = typeof value.id === "string" && /^[a-z0-9-]{1,64}$/i.test(value.id)
    ? value.id
    : existing?.id ?? randomUUID();
  const enabled = value.enabled === true;
  if (value.transport === "stdio") {
    const command = typeof value.command === "string" ? value.command.trim() : "";
    if (!command || command.length > 512 || command.includes("\0")) {
      throw new Error("Indica un comando ejecutable válido (máximo 512 caracteres).");
    }
    const args = normalizeStringArray(value.args, "Los argumentos", 100, 2048);
    const env = normalizeStringRecord(value.env === undefined ? existing?.env : value.env, "Las variables de entorno", 100, 4096);
    return {
      id,
      name,
      transport: "stdio",
      enabled,
      command,
      args,
      env,
      updatedAt: new Date().toISOString(),
    };
  }

  const urlValue = typeof value.url === "string" ? value.url.trim() : "";
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("Introduce una URL SSE válida.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("La URL SSE debe usar HTTP/HTTPS y no incluir credenciales ni fragmentos.");
  }
  const headers = normalizeStringRecord(value.headers === undefined ? existing?.headers : value.headers, "Los encabezados", 50, 8192);
  for (const key of Object.keys(headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) {
      throw new Error(`El nombre de encabezado "${key}" no es válido.`);
    }
  }
  return {
    id,
    name,
    transport: "sse",
    enabled,
    url: url.href,
    headers,
    updatedAt: new Date().toISOString(),
  };
}

export async function listMCPServers(): Promise<MCPServerConfig[]> {
  try {
    const text = await readFile(SERVER_STORE, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length > MAX_SERVERS) {
      throw new Error("El archivo de servidores MCP tiene un formato no válido.");
    }
    return parsed.map((item) => normalizeStoredServer(item));
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveMCPServer(input: unknown): Promise<MCPServerConfig> {
  const servers = await listMCPServers();
  const existing = isRecord(input) && typeof input.id === "string"
    ? servers.find((server) => server.id === input.id)
    : undefined;
  const server = normalizeMCPServer(input, existing);
  const next = existing
    ? servers.map((item) => item.id === existing.id ? server : item)
    : [...servers, server];
  if (next.length > MAX_SERVERS) throw new Error("Se alcanzó el límite de 50 servidores MCP.");
  await writeMCPServers(next);
  return server;
}

export async function deleteMCPServer(id: string): Promise<void> {
  const servers = await listMCPServers();
  const next = servers.filter((server) => server.id !== id);
  if (next.length === servers.length) throw new Error("No se encontró el servidor MCP.");
  await writeMCPServers(next);
}

export async function withMCPClient<T>(
  server: MCPServerConfig,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "PulseStudio", version: "0.1.0" });
  const transport = server.transport === "stdio"
    ? new StdioClientTransport({
        command: server.command ?? "",
        args: server.args ?? [],
        env: server.env,
        stderr: "ignore",
      })
    : new SSEClientTransport(new URL(server.url ?? ""), {
      requestInit: { headers: server.headers, redirect: "error" },
      eventSourceInit: { fetch: createHeaderFetch(server.headers ?? {}) },
    });
  let connected = false;
  try {
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, "La conexión MCP excedió 10 segundos.");
    connected = true;
    return await operation(client);
  } finally {
    if (connected) {
      await client.close().catch((error: unknown) => {
        console.error("MCP client close failed", error);
      });
    } else {
      await transport.close().catch((error: unknown) => {
        console.error("MCP transport cleanup failed", error);
      });
    }
  }
}

export async function discoverMCPTools(server: MCPServerConfig): Promise<MCPToolSummary[]> {
  const result = await withMCPClient(server, (client) => withTimeout(
    client.listTools({}, { timeout: TOOL_TIMEOUT_MS }),
    TOOL_TIMEOUT_MS,
    `La consulta de herramientas a "${server.name}" excedió el tiempo límite.`,
  ));
  return result.tools.slice(0, MAX_TOOLS).map((tool) => ({
    name: tool.name,
    ...(tool.description ? { description: tool.description.slice(0, 2000) } : {}),
    inputSchema: tool.inputSchema,
  }));
}

export async function callMCPTool(server: MCPServerConfig, name: string, args: Record<string, unknown>) {
  const result = await withMCPClient(server, (client) => withTimeout(
    client.callTool({ name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT_MS }),
    TOOL_TIMEOUT_MS,
    `La herramienta "${name}" excedió el tiempo límite de 30 segundos.`,
  ));
  const content = JSON.stringify(result);
  return {
    isError: result.isError === true,
    result: content.length > MAX_RESULT_CHARS
      ? `${content.slice(0, MAX_RESULT_CHARS)}\n… resultado truncado`
      : content,
  };
}

function normalizeStoredServer(value: unknown): MCPServerConfig {
  if (!isRecord(value)) throw new Error("Se encontró una configuración MCP no válida.");
  const normalized = normalizeMCPServer(value);
  if (typeof value.updatedAt !== "string") throw new Error("La fecha de configuración MCP no es válida.");
  normalized.updatedAt = value.updatedAt;
  return normalized;
}

function normalizeStringArray(value: unknown, label: string, maxItems: number, maxLength: number) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) =>
    typeof item !== "string" || item.length > maxLength || item.includes("\0")
  )) {
    throw new Error(`${label} no son válidos o exceden sus límites.`);
  }
  return value as string[];
}

function normalizeStringRecord(value: unknown, label: string, maxEntries: number, maxLength: number) {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > maxEntries) {
    throw new Error(`${label} no son válidos o exceden su límite.`);
  }
  const entries = Object.entries(value);
  if (entries.some(([key, item]) =>
    !key || key.length > 256 || typeof item !== "string" || item.length > maxLength || item.includes("\0")
  )) {
    throw new Error(`${label} contienen valores no válidos.`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

async function writeMCPServers(servers: MCPServerConfig[]) {
  const directory = path.dirname(SERVER_STORE);
  await mkdir(directory, { recursive: true });
  const temporary = `${SERVER_STORE}.${randomUUID()}.tmp`;
  const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await file.writeFile(JSON.stringify(servers, null, 2), "utf8");
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, SERVER_STORE);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function createHeaderFetch(headers: Record<string, string>): typeof fetch {
  return (input, init = {}) => {
    const requestHeaders = new Headers(headers);
    new Headers(init.headers).forEach((value, key) => requestHeaders.set(key, value));
    return fetch(input, { ...init, headers: requestHeaders, redirect: "error" });
  };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
