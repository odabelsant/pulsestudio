import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredHistory } from "@/lib/historyCleanup";
import {
  ChangedActionContextError,
  encodeActionAudit,
  isActionContextPurpose,
  isAllowedAgentActionRecord,
  validateActionContextDocument,
} from "@/lib/action-context";
import { localApiAuthorizationError } from "@/lib/local-api-auth";
import type { ActionContextReference } from "@/types/action-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_LENGTH = 200_000;

const EMPTY_HISTORY = {
  sessions: [],
  agentActions: [],
  actionApprovals: [],
  proposals: [],
  runnerExecutions: [],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeContextReferences(value: unknown): ActionContextReference[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const references: ActionContextReference[] = [];
  const ids = new Set<string>();
  for (const reference of value) {
    if (
      !isRecord(reference) ||
      typeof reference.documentId !== "string" ||
      !reference.documentId.trim() ||
      reference.documentId.length > 200 ||
      ids.has(reference.documentId) ||
      !isActionContextPurpose(reference.purpose) ||
      typeof reference.title !== "string" ||
      !reference.title.trim() ||
      reference.title.length > 240 ||
      typeof reference.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(reference.sha256)
    ) {
      return null;
    }
    ids.add(reference.documentId);
    references.push({
      documentId: reference.documentId,
      purpose: reference.purpose,
      title: reference.title.trim(),
      sha256: reference.sha256.toLowerCase(),
    });
  }
  return references;
}

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  try {
    try {
      await cleanupExpiredHistory();
    } catch (cleanupError) {
      console.error("Unified history cleanup skipped", cleanupError);
    }
    const [sessions, agentActions, runnerExecutions] = await Promise.all([
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
      prisma.runnerExecution.findMany({
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          job: true,
          command: true,
          status: true,
          approvalId: true,
          exitCode: true,
          durationMs: true,
          timedOut: true,
          error: true,
          startedAt: true,
          completedAt: true,
        },
      }),
    ]);
    const runnerApprovalIds = runnerExecutions.flatMap((execution) =>
      execution.approvalId ? [execution.approvalId] : [],
    );
    const [runnerApprovals, actionApprovals, proposals] = await Promise.all([
      runnerApprovalIds.length > 0
        ? prisma.actionApproval.findMany({
            where: { id: { in: runnerApprovalIds } },
            select: { id: true, contentHash: true, target: true, approvedAt: true, status: true },
          })
        : Promise.resolve([]),
      prisma.actionApproval.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          operation: true,
          target: true,
          contentHash: true,
          status: true,
          approvedAt: true,
          startedAt: true,
          completedAt: true,
          resultSummary: true,
          errorSummary: true,
        },
      }),
      prisma.proposal.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          humanApproval: true,
          approvedDiffHash: true,
          approvedAt: true,
          applied: true,
          published: true,
          createdAt: true,
        },
      }),
    ]);
    const approvalsById = new Map(runnerApprovals.map((approval) => [approval.id, approval]));
    return NextResponse.json({
      sessions,
      agentActions,
      actionApprovals,
      proposals,
      runnerExecutions: runnerExecutions.map((execution) => ({
        ...execution,
        approval: execution.approvalId ? approvalsById.get(execution.approvalId) ?? null : null,
      })),
    });
  } catch (error) {
    console.error("Unified history read failed", error);
    return NextResponse.json({
      ...EMPTY_HISTORY,
      degraded: true,
      warning: "No se pudo cargar el historial completo; mostrando vista vacía.",
    });
  }
}

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
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
      const contextReferences = body.contextReferences === undefined
        ? []
        : normalizeContextReferences(body.contextReferences);
      const notebookId = typeof body.notebookId === "string" ? body.notebookId.trim() : "";
      if (
        typeof body.actionType !== "string" ||
        typeof body.status !== "string" ||
        !isAllowedAgentActionRecord(body.actionType, body.status, body.testCases) ||
        JSON.stringify(body.testCases).length > MAX_CONTENT_LENGTH ||
        (body.storyReference !== undefined && body.storyReference !== null && typeof body.storyReference !== "string") ||
        contextReferences === null ||
        (contextReferences.length > 0 && !notebookId)
      ) {
        return NextResponse.json({ error: "Los datos de auditoría del Action Agent no son válidos." }, { status: 400 });
      }
      let verifiedContextReferences = contextReferences;
      if (contextReferences.length > 0) {
        const documents = await prisma.contextDocument.findMany({
          where: {
            id: { in: contextReferences.map((reference) => reference.documentId) },
            notebookId,
          },
          select: {
            id: true,
            moduleName: true,
            sourceType: true,
            markdownContent: true,
          },
        });
        if (documents.length !== contextReferences.length) {
          return NextResponse.json({ error: "Una fuente ya no pertenece al cuaderno activo." }, { status: 400 });
        }
        const documentsById = new Map(documents.map((document) => [document.id, document]));
        verifiedContextReferences = [];
        for (const reference of contextReferences) {
          const document = documentsById.get(reference.documentId);
          if (!document || !validateActionContextDocument({
            title: document.moduleName,
            sourceType: document.sourceType,
            markdownContent: document.markdownContent,
          })) {
            return NextResponse.json({ error: "Las referencias de acción deben apuntar a fuentes Markdown." }, { status: 400 });
          }
          const sha256 = createHash("sha256").update(document.markdownContent).digest("hex");
          if (reference.title !== document.moduleName || reference.sha256 !== sha256) {
            const error = new ChangedActionContextError("Una fuente cambió durante la generación; vuelve a generar el borrador.");
            return NextResponse.json({ error: error.message }, { status: error.status });
          }
          verifiedContextReferences.push({
            documentId: document.id,
            purpose: reference.purpose,
            title: document.moduleName,
            sha256,
          });
        }
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
            ? (contextReferences.length
              ? encodeActionAudit(body.syncResult.slice(0, 16_000), verifiedContextReferences)
              : body.syncResult.slice(0, 20_000))
            : contextReferences.length
              ? encodeActionAudit("", verifiedContextReferences)
              : null,
        },
      });
      return NextResponse.json({ log }, { status: 201 });
    }

    if (body.action === "update-agent-action") {
      return NextResponse.json(
        { error: "Las transiciones de aprobación y sincronización no están habilitadas." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Acción de historial desconocida." }, { status: 400 });
  } catch {
    console.error("Unified history write failed");
    return NextResponse.json(
      { error: "No se pudo guardar el historial." },
      { status: 500 },
    );
  }
}
