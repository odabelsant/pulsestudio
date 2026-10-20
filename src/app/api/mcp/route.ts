import { NextResponse } from "next/server";
import { localApiAuthorizationError } from "@/lib/local-api-auth";
import {
  consumeActionApproval,
  createActionApproval,
  finishActionApproval,
} from "@/lib/action-authorization-store";
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
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
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
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar los servidores MCP; revisa la configuración local." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
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
    if (body.action === "authorize" || body.action === "invoke") {
      if (
        typeof body.serverId !== "string" ||
        typeof body.toolName !== "string" ||
        !isRecord(body.arguments)
      ) {
        return NextResponse.json({ error: "Servidor, herramienta y argumentos JSON son requeridos." }, { status: 400 });
      }
      const serializedArguments = JSON.stringify(body.arguments);
      if (serializedArguments.length > 50_000) {
        return NextResponse.json({ error: "Los argumentos MCP superan el límite de 50 KB." }, { status: 413 });
      }
      const servers = await listMCPServers();
      const server = servers.find((item) => item.id === body.serverId);
      if (!server) return NextResponse.json({ error: "No se encontró el servidor MCP." }, { status: 404 });
      if (!server.enabled) return NextResponse.json({ error: "Activa el servidor MCP antes de invocar una herramienta." }, { status: 409 });
      const tools = await discoverMCPTools(server);
      const tool = tools.find((item) => item.name === body.toolName);
      if (!tool) {
        return NextResponse.json({ error: "La herramienta ya no está disponible en ese servidor." }, { status: 409 });
      }
      const authorization = {
        operation: "mcp.invoke",
        target: `${server.id}:${tool.name}`,
        payload: { server, tool, arguments: body.arguments },
      };
      if (body.action === "authorize") {
        const approval = await createActionApproval(authorization);
        return NextResponse.json({
          approvalId: approval.id,
          contentHash: approval.contentHash,
          expiresAt: approval.expiresAt,
          target: approval.target,
        });
      }
      if (typeof body.approvalId !== "string" ||
        !await consumeActionApproval(body.approvalId, authorization)) {
        return NextResponse.json({
          error: "La aprobación MCP falta, expiró, ya se usó o no corresponde exactamente a esta invocación.",
        }, { status: 403 });
      }
      try {
        const result = await callMCPTool(server, tool.name, body.arguments);
        const approvalFinalized = await finishActionApproval(body.approvalId, {
          status: result.isError ? "FAILED" : "COMPLETED",
          summary: result.isError ? "La herramienta MCP reportó un error." : "La herramienta MCP devolvió una respuesta.",
        });
        if (!approvalFinalized) {
          throw new Error("No se pudo persistir el resultado de la autorización MCP.");
        }
        return NextResponse.json(result);
      } catch {
        await finishActionApproval(body.approvalId, {
          status: "FAILED",
          error: "La invocación MCP falló.",
        });
        throw new Error("La invocación MCP falló; revisa la conexión y los permisos.");
      }
    }
    return NextResponse.json({ error: "Acción desconocida. Usa save, test, authorize o invoke." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: body.action === "test"
        ? "No se pudo probar la conexión MCP; revisa la configuración local."
        : "No se pudo completar la operación MCP." },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.serverId !== "string") {
    return NextResponse.json({ error: "El identificador del servidor MCP es obligatorio." }, { status: 400 });
  }
  try {
    await deleteMCPServer(body.serverId);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar el servidor MCP." }, { status: 400 });
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
