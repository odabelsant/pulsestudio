import { NextResponse } from "next/server";
import {
  callMCPTool,
  deleteMCPServer,
  discoverMCPTools,
  listMCPServers,
  normalizeMCPServer,
  publicMCPServer,
  saveMCPServer,
  type MCPServerConfig,
} from "@/lib/mcpServers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const servers = await listMCPServers();
    const serverId = new URL(request.url).searchParams.get("tools");
    if (serverId) {
      const server = servers.find((item) => item.id === serverId);
      if (!server) return NextResponse.json({ error: "No se encontró el servidor MCP." }, { status: 404 });
      if (!server.enabled) return NextResponse.json({ error: "Activa el servidor antes de consultar sus herramientas." }, { status: 409 });
      return NextResponse.json({ tools: await discoverMCPTools(server) });
    }
    return NextResponse.json({ servers: servers.map(publicMCPServer) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los servidores MCP." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) {
    return NextResponse.json({ error: "La solicitud MCP supera el límite de 1 MB." }, { status: 413 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.action !== "string") {
    return NextResponse.json({ error: "La acción solicitada no es válida." }, { status: 400 });
  }

  try {
    if (body.action === "save") {
      const server = await saveMCPServer(body.server);
      return NextResponse.json({ server: publicMCPServer(server) });
    }
    if (body.action === "test") {
      const server = await findServer(body.serverId, body.draft);
      const tools = await discoverMCPTools(server);
      return NextResponse.json({ connected: true, tools });
    }
    if (body.action === "invoke") {
      if (body.approved !== true) {
        return NextResponse.json({ error: "Confirma explícitamente la invocación de la herramienta." }, { status: 403 });
      }
      if (typeof body.serverId !== "string" || typeof body.toolName !== "string" || !isRecord(body.arguments)) {
        return NextResponse.json({ error: "Servidor, herramienta y argumentos JSON son requeridos." }, { status: 400 });
      }
      const servers = await listMCPServers();
      const server = servers.find((item) => item.id === body.serverId);
      if (!server) return NextResponse.json({ error: "No se encontró el servidor MCP." }, { status: 404 });
      if (!server.enabled) return NextResponse.json({ error: "Activa el servidor MCP antes de invocar una herramienta." }, { status: 409 });
      const tools = await discoverMCPTools(server);
      if (!tools.some((tool) => tool.name === body.toolName)) {
        return NextResponse.json({ error: "La herramienta ya no está disponible en ese servidor." }, { status: 409 });
      }
      return NextResponse.json(await callMCPTool(server, body.toolName, body.arguments));
    }
    return NextResponse.json({ error: "Acción desconocida. Usa save, test o invoke." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "La operación MCP falló." },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.serverId !== "string") {
    return NextResponse.json({ error: "El identificador del servidor MCP es obligatorio." }, { status: 400 });
  }
  try {
    await deleteMCPServer(body.serverId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar el servidor MCP." },
      { status: 400 },
    );
  }
}

async function findServer(serverId: unknown, draft: unknown): Promise<MCPServerConfig> {
  if (typeof serverId === "string" && serverId) {
    const server = (await listMCPServers()).find((item) => item.id === serverId);
    if (!server) throw new Error("No se encontró el servidor MCP.");
    return server;
  }
  return normalizeMCPServer(draft);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
