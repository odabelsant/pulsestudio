import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { localApiAuthorizationError } from "@/lib/local-api-auth";
import { actionContentHash } from "@/lib/action-authorization";
import { decodeActionAudit } from "@/lib/action-context";
import { QaValidationError } from "@/lib/qa-domain";
import { verifyQaContextReferences } from "@/lib/qa-action-context";
import { readBoundedJson } from "@/lib/bounded-json";
import {
  consumeActionApproval,
  createActionApproval,
  finishActionApproval,
} from "@/lib/action-authorization-store";
import {
  normalizeQaTestCaseImport,
  matchesQaTestCaseSource,
  qaTestCaseImportAuthorization,
} from "@/lib/qa-test-case-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 1_100_000;

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const parsedBody = await readBoundedJson(request, MAX_REQUEST_BYTES);
  if (!parsedBody.ok) {
    return parsedBody.reason === "too-large"
      ? NextResponse.json({ error: "La importación supera el límite de 1 MB." }, { status: 413 })
      : NextResponse.json({ error: "El cuerpo JSON de la importación no es válido." }, { status: 400 });
  }
  const body = parsedBody.value;
  if (!isRecord(body) || (body.action !== "authorize" && body.action !== "execute")) {
    return NextResponse.json({ error: "Usa la acción authorize o execute." }, { status: 400 });
  }

  let approvalId: string | null = null;
  let approvalConsumed = false;
  try {
    const payload = normalizeQaTestCaseImport(body);
    await verifyQaContextReferences(payload.contextReferences, payload.contextNotebookId);
    await verifySourceAction(payload.sourceActionLogId, payload);
    await verifyRequirements(payload.cases.flatMap((testCase) => testCase.requirementIds));
    const action = qaTestCaseImportAuthorization(payload);

    if (body.action === "authorize") {
      const approval = await createActionApproval(action);
      return NextResponse.json({
        approvalId: approval.id,
        contentHash: approval.contentHash,
        expiresAt: approval.expiresAt,
      });
    }

    if (typeof body.approvalId !== "string" || !body.approvalId.trim()) {
      return NextResponse.json({ error: "Se requiere una aprobación emitida por el servidor." }, { status: 403 });
    }
    approvalId = body.approvalId;
    approvalConsumed = await consumeActionApproval(approvalId, action);
    if (!approvalConsumed) {
      return NextResponse.json(
        { error: "La aprobación expiró, ya se usó o no coincide con estos casos y su contexto." },
        { status: 403 },
      );
    }

    const created = await prisma.$transaction(async (transaction) => {
      await verifyQaContextReferences(payload.contextReferences, payload.contextNotebookId, transaction);
      await verifySourceAction(payload.sourceActionLogId, payload, transaction);
      await verifyRequirements(
        payload.cases.flatMap((testCase) => testCase.requirementIds),
        transaction,
      );
      const records = [];
      for (const testCase of payload.cases) {
        const record = await transaction.testCase.create({
          data: {
            title: testCase.title,
            description: testCase.description,
            category: testCase.category,
            gherkin: testCase.gherkin,
            steps: JSON.stringify(testCase.steps),
            status: "APPROVED",
            contextReferences: JSON.stringify(payload.contextReferences),
            contextNotebookId: payload.contextNotebookId,
            contentHash: actionContentHash(action),
            sourceActionLogId: payload.sourceActionLogId,
            requirements: {
              create: testCase.requirementIds.map((requirementId) => ({
                requirement: { connect: { id: requirementId } },
              })),
            },
          },
          select: { id: true, title: true, status: true, contentHash: true },
        });
        records.push(record);
      }
      const sourceUpdated = await transaction.agentActionLog.updateMany({
        where: {
          id: payload.sourceActionLogId,
          action: "GENERATED",
          status: "DRAFT",
        },
        data: { status: "APPROVED" },
      });
      if (sourceUpdated.count !== 1) {
        throw new QaValidationError("El borrador ya fue importado o cambió antes de guardarse.");
      }
      const finalized = await transaction.actionApproval.updateMany({
        where: { id: approvalId ?? "", status: "RUNNING" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          resultSummary: `${records.length} caso(s) QA guardado(s) localmente.`,
        },
      });
      if (finalized.count !== 1) throw new Error("No se pudo finalizar la aprobación.");
      return records;
    });
    return NextResponse.json({ cases: created }, { status: 201 });
  } catch (error) {
    if (approvalConsumed && approvalId) {
      await finishActionApproval(approvalId, {
        status: "FAILED",
        error: "No se pudieron persistir los casos QA autorizados.",
      });
    }
    if (error instanceof QaValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isRecord(error) && error.code === "P2025") {
      return NextResponse.json({ error: "No existe un requisito relacionado." }, { status: 404 });
    }
    console.error("Approved QA test case import failed");
    return NextResponse.json({ error: "No se pudieron guardar los casos QA." }, { status: 500 });
  }
}

async function verifySourceAction(
  sourceActionLogId: string,
  payload: ReturnType<typeof normalizeQaTestCaseImport>,
  database: Pick<Prisma.TransactionClient, "agentActionLog"> = prisma,
) {
  const source = await database.agentActionLog.findUnique({
    where: { id: sourceActionLogId },
    select: { id: true, action: true, status: true, testCases: true, syncResult: true },
  });
  if (!source || source.action !== "GENERATED" || source.status !== "DRAFT") {
    throw new QaValidationError("El registro de origen ya no es un borrador de generación válido.");
  }
  const sourceContextReferences = decodeActionAudit(source.syncResult ?? "").contextReferences;
  if (!matchesQaTestCaseSource(source.testCases, sourceContextReferences, payload)) {
    throw new QaValidationError("Los casos o las fuentes no coinciden con el borrador de origen.");
  }
}

async function verifyRequirements(
  ids: string[],
  database: Pick<Prisma.TransactionClient, "requirement"> = prisma,
) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return;
  const count = await database.requirement.count({ where: { id: { in: uniqueIds } } });
  if (count !== uniqueIds.length) {
    throw new QaValidationError("Uno o más requisitos asociados ya no existen.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
