import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredHistory } from "@/lib/historyCleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION_STATUSES = new Set(["DRAFT", "APPROVED", "SYNCED"]);
const ACTION_TYPES = new Set(["GENERATED", "CLEARED", "APPROVE_SYNC"]);
const MAX_CONTENT_LENGTH = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    await cleanupExpiredHistory();
    const [sessions, agentActions] = await Promise.all([
      prisma.chatSession.findMany({
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 200,
          },
        },
      }),
      prisma.agentActionLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return NextResponse.json({ sessions, agentActions });
  } catch (error) {
    console.error("Unified history read failed", error);
    return NextResponse.json({ error: "No se pudo cargar el historial unificado." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.action !== "string") {
    return NextResponse.json({ error: "Se requiere una acción válida para el historial." }, { status: 400 });
  }

  try {
    if (body.action === "create-session") {
      const title = typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 160)
        : "Nueva conversación";
      const session = await prisma.chatSession.create({ data: { title } });
      return NextResponse.json({ session }, { status: 201 });
    }

    if (body.action === "save-message") {
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const content = typeof body.content === "string" ? body.content.trim() : "";
      const role = body.role === "user" || body.role === "assistant" ? body.role : null;
      const providerValue = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
      const provider =
        providerValue === "google" || providerValue === "google-gemini" || providerValue === "gemini"
          ? "google"
          : providerValue === "ollama"
            ? "ollama"
            : null;
      const validationErrors: string[] = [];
      if (!sessionId) validationErrors.push("sessionId");
      if (!role) validationErrors.push("role");
      if (!content) validationErrors.push("content");
      if (content.length > MAX_CONTENT_LENGTH) validationErrors.push("content exceeds maximum length");
      if (!provider) validationErrors.push("provider");
      if (validationErrors.length > 0 || !sessionId || !role || !content || !provider) {
        return NextResponse.json(
          {
            error: `Datos de mensaje no válidos: ${validationErrors.join(", ")}.`,
            invalidFields: validationErrors,
          },
          { status: 400 },
        );
      }
      const message = await prisma.$transaction(async (transaction) => {
        const session = await transaction.chatSession.findUnique({ where: { id: sessionId } });
        if (!session) throw new Error(`No se encontró la sesión de chat: ${sessionId}`);
        const saved = await transaction.chatMessage.create({
          data: {
            sessionId: session.id,
            role,
            content,
            provider,
          },
        });
        await transaction.chatSession.update({
          where: { id: session.id },
          data: { updatedAt: new Date() },
        });
        return saved;
      });
      return NextResponse.json({ message }, { status: 201 });
    }

    if (body.action === "record-agent-action") {
      if (
        typeof body.actionType !== "string" ||
        !ACTION_TYPES.has(body.actionType) ||
        typeof body.status !== "string" ||
        !ACTION_STATUSES.has(body.status) ||
        !Array.isArray(body.testCases) ||
        body.testCases.length > 100 ||
        JSON.stringify(body.testCases).length > MAX_CONTENT_LENGTH ||
        (body.storyReference !== undefined && body.storyReference !== null && typeof body.storyReference !== "string")
      ) {
        return NextResponse.json({ error: "Los datos de auditoría del Action Agent no son válidos." }, { status: 400 });
      }
      const log = await prisma.agentActionLog.create({
        data: {
          action: body.actionType,
          status: body.status,
          storyReference: typeof body.storyReference === "string"
            ? body.storyReference.trim().slice(0, 1000) || null
            : null,
          testCases: JSON.stringify(body.testCases),
          syncResult: typeof body.syncResult === "string"
            ? body.syncResult.slice(0, 20_000)
            : null,
        },
      });
      return NextResponse.json({ log }, { status: 201 });
    }

    if (body.action === "update-agent-action") {
      if (
        typeof body.id !== "string" ||
        !body.id ||
        typeof body.status !== "string" ||
        !ACTION_STATUSES.has(body.status) ||
        (body.syncResult !== undefined && typeof body.syncResult !== "string")
      ) {
        return NextResponse.json({ error: "La actualización de auditoría no es válida." }, { status: 400 });
      }
      const log = await prisma.agentActionLog.update({
        where: { id: body.id },
        data: {
          status: body.status,
          ...(typeof body.syncResult === "string"
            ? { syncResult: body.syncResult.slice(0, 20_000) }
            : {}),
        },
      });
      return NextResponse.json({ log });
    }

    return NextResponse.json({ error: "Acción de historial desconocida." }, { status: 400 });
  } catch (error) {
    console.error("Unified history write failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el historial." },
      { status: 500 },
    );
  }
}
