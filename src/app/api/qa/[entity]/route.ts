import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localApiAuthorizationError } from "@/lib/local-api-auth";
import {
  normalizeBugInput,
  normalizeRequirementInput,
  normalizeQaContextReferences,
  normalizeTestCaseInput,
  normalizeTestPlanInput,
  normalizeTestSuiteInput,
  QaValidationError,
  QA_ENTITIES,
} from "@/lib/qa-domain";
import { verifyQaContextReferences } from "@/lib/qa-action-context";
import { readBoundedJson } from "@/lib/bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ entity: string }> };
const MAX_REQUEST_BYTES = 1_100_000;

const testCaseInclude = {
  requirements: { include: { requirement: true } },
  suites: { include: { testSuite: true } },
};

export async function GET(request: Request, { params }: RouteContext) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const { entity } = await params;
  if (!isQaEntity(entity)) return notFoundEntity();

  try {
    const result = await listRecords(entity);
    return NextResponse.json(result);
  } catch {
    console.error("QA module list failed", { entity });
    return NextResponse.json({ error: "No se pudieron cargar los registros de QA." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const parsedBody = await readBoundedJson(request, MAX_REQUEST_BYTES);
  if (!parsedBody.ok) return invalidBodyResponse(parsedBody.reason);
  const { entity } = await params;
  if (!isQaEntity(entity)) return notFoundEntity();

  try {
    const created = await createRecord(entity, parsedBody.value);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleWriteError(error, "No se pudo crear el registro de QA.");
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const parsedBody = await readBoundedJson(request, MAX_REQUEST_BYTES);
  if (!parsedBody.ok) return invalidBodyResponse(parsedBody.reason);
  const { entity } = await params;
  if (!isQaEntity(entity)) return notFoundEntity();
  const body = parsedBody.value;
  if (!isRecord(body) || typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "Se requiere el identificador del registro." }, { status: 400 });
  }

  try {
    const updated = await updateRecord(entity, body.id, body);
    return NextResponse.json(updated);
  } catch (error) {
    return handleWriteError(error, "No se pudo actualizar el registro de QA.");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const { entity } = await params;
  if (!isQaEntity(entity)) return notFoundEntity();
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Se requiere el identificador del registro." }, { status: 400 });

  try {
    await deleteRecord(entity, id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleWriteError(error, "No se pudo eliminar el registro de QA.");
  }
}

function isQaEntity(value: string): value is (typeof QA_ENTITIES)[number] {
  return QA_ENTITIES.includes(value as (typeof QA_ENTITIES)[number]);
}

function notFoundEntity() {
  return NextResponse.json({ error: "El módulo QA solicitado no existe." }, { status: 404 });
}

function invalidBodyResponse(reason: "invalid" | "too-large") {
  return reason === "too-large"
    ? NextResponse.json({ error: "La solicitud supera el límite de 1 MB." }, { status: 413 })
    : NextResponse.json({ error: "El cuerpo JSON de la solicitud no es válido." }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function handleWriteError(error: unknown, fallback: string) {
  if (error instanceof QaValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (isRecord(error) && error.code === "P2025") {
    return NextResponse.json({ error: "No se encontró el registro o una relación indicada." }, { status: 404 });
  }
  if (isRecord(error) && error.code === "P2002") {
    return NextResponse.json({ error: "Ya existe un registro con ese identificador único." }, { status: 409 });
  }
  console.error("QA module write failed");
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function listRecords(entity: (typeof QA_ENTITIES)[number]) {
  switch (entity) {
    case "requirements":
      return prisma.requirement.findMany({
        orderBy: { updatedAt: "desc" },
        include: { testCases: { include: { testCase: { select: { id: true, title: true } } } } },
      });
    case "test-cases":
      return prisma.testCase.findMany({ orderBy: { updatedAt: "desc" }, include: testCaseInclude });
    case "test-plans":
      return prisma.testPlan.findMany({
        orderBy: { updatedAt: "desc" },
        include: { suites: { include: { testSuite: true }, orderBy: { position: "asc" } } },
      });
    case "test-suites":
      return prisma.testSuite.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          plans: { include: { testPlan: true } },
          testCases: { include: { testCase: true }, orderBy: { position: "asc" } },
        },
      });
    case "bugs":
      return prisma.bug.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          testCase: { select: { id: true, title: true } },
          runnerExecution: { select: { id: true, job: true, status: true } },
        },
      });
  }
}

async function createRecord(entity: (typeof QA_ENTITIES)[number], body: unknown) {
  switch (entity) {
    case "requirements": {
      const input = normalizeRequirementInput(body);
      return prisma.requirement.create({
        data: { ...input, acceptanceCriteria: JSON.stringify(input.acceptanceCriteria), origin: "LOCAL" },
      });
    }
    case "test-cases": {
      if (!isRecord(body)) throw new QaValidationError("El caso de prueba debe ser un objeto.");
      const input = normalizeTestCaseInput(body);
      const references = normalizeQaContextReferences(body.contextReferences);
      const notebookId = optionalId(body.contextNotebookId, "contextNotebookId");
      await verifyQaContextReferences(references, notebookId);
      await assertRequirements(input.requirementIds);
      const contextReferences = JSON.stringify(references);
      const contentHash = testCaseHash(input, references);
      return prisma.testCase.create({
        data: {
          ...testCaseData(input),
          status: "DRAFT",
          contextReferences,
          contextNotebookId: notebookId,
          contentHash,
          requirements: { create: input.requirementIds.map((requirementId) => ({ requirement: { connect: { id: requirementId } } })) },
        },
        include: testCaseInclude,
      });
    }
    case "test-plans": {
      const input = normalizeTestPlanInput(body);
      await assertSuites(input.suiteIds);
      return prisma.testPlan.create({
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          suites: { create: input.suiteIds.map((testSuiteId, position) => ({ position, testSuite: { connect: { id: testSuiteId } } })) },
        },
        include: { suites: { include: { testSuite: true }, orderBy: { position: "asc" } } },
      });
    }
    case "test-suites": {
      const input = normalizeTestSuiteInput(body);
      await assertPlans(input.planIds);
      await assertTestCases(input.testCaseIds);
      return prisma.testSuite.create({
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          plans: { create: input.planIds.map((testPlanId) => ({ testPlan: { connect: { id: testPlanId } } })) },
          testCases: { create: input.testCaseIds.map((testCaseId, position) => ({ position, testCase: { connect: { id: testCaseId } } })) },
        },
        include: {
          plans: { include: { testPlan: true } },
          testCases: { include: { testCase: true }, orderBy: { position: "asc" } },
        },
      });
    }
    case "bugs": {
      const input = normalizeBugInput(body);
      await assertBugReferences(input.testCaseId, input.runnerExecutionId);
      return prisma.bug.create({
        data: {
          ...bugData(input),
          ...(input.testCaseId ? { testCase: { connect: { id: input.testCaseId } } } : {}),
          ...(input.runnerExecutionId ? { runnerExecution: { connect: { id: input.runnerExecutionId } } } : {}),
        },
        include: bugInclude,
      });
    }
  }
}

async function updateRecord(entity: (typeof QA_ENTITIES)[number], id: string, body: Record<string, unknown>) {
  switch (entity) {
    case "requirements": {
      const input = normalizeRequirementInput(body);
      return prisma.requirement.update({
        where: { id },
        data: { ...input, acceptanceCriteria: JSON.stringify(input.acceptanceCriteria) },
      });
    }
    case "test-cases": {
      const input = normalizeTestCaseInput(body);
      const current = await prisma.testCase.findUnique({ where: { id } });
      if (!current) throw { code: "P2025" };
      const references = normalizeQaContextReferences(
        body.contextReferences === undefined ? parseJsonArray(current.contextReferences) : body.contextReferences,
      );
      const notebookId = body.contextNotebookId === undefined
        ? current.contextNotebookId
        : optionalId(body.contextNotebookId, "contextNotebookId");
      await verifyQaContextReferences(references, notebookId);
      await assertRequirements(input.requirementIds);
      const contentHash = testCaseHash(input, references);
      return prisma.testCase.update({
        where: { id },
        data: {
          ...testCaseData(input),
          status: normalizedEditableTestCaseStatus(body.status),
          contextReferences: JSON.stringify(references),
          contextNotebookId: notebookId,
          contentHash,
          requirements: {
            deleteMany: {},
            create: input.requirementIds.map((requirementId) => ({ requirement: { connect: { id: requirementId } } })),
          },
        },
        include: testCaseInclude,
      });
    }
    case "test-plans": {
      const input = normalizeTestPlanInput(body);
      await assertSuites(input.suiteIds);
      return prisma.testPlan.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          suites: {
            deleteMany: {},
            create: input.suiteIds.map((testSuiteId, position) => ({ position, testSuite: { connect: { id: testSuiteId } } })),
          },
        },
        include: { suites: { include: { testSuite: true }, orderBy: { position: "asc" } } },
      });
    }
    case "test-suites": {
      const input = normalizeTestSuiteInput(body);
      await assertPlans(input.planIds);
      await assertTestCases(input.testCaseIds);
      return prisma.testSuite.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          plans: {
            deleteMany: {},
            create: input.planIds.map((testPlanId) => ({ testPlan: { connect: { id: testPlanId } } })),
          },
          testCases: {
            deleteMany: {},
            create: input.testCaseIds.map((testCaseId, position) => ({ position, testCase: { connect: { id: testCaseId } } })),
          },
        },
        include: {
          plans: { include: { testPlan: true } },
          testCases: { include: { testCase: true }, orderBy: { position: "asc" } },
        },
      });
    }
    case "bugs": {
      const input = normalizeBugInput(body);
      await assertBugReferences(input.testCaseId, input.runnerExecutionId);
      return prisma.bug.update({
        where: { id },
        data: {
          ...bugData(input),
          testCase: input.testCaseId ? { connect: { id: input.testCaseId } } : { disconnect: true },
          runnerExecution: input.runnerExecutionId ? { connect: { id: input.runnerExecutionId } } : { disconnect: true },
        },
        include: bugInclude,
      });
    }
  }
}

async function deleteRecord(entity: (typeof QA_ENTITIES)[number], id: string) {
  switch (entity) {
    case "requirements": return prisma.requirement.delete({ where: { id } });
    case "test-cases": return prisma.testCase.delete({ where: { id } });
    case "test-plans": return prisma.testPlan.delete({ where: { id } });
    case "test-suites": return prisma.testSuite.delete({ where: { id } });
    case "bugs": return prisma.bug.delete({ where: { id } });
  }
}

const bugInclude = {
  testCase: { select: { id: true, title: true } },
  runnerExecution: { select: { id: true, job: true, status: true } },
};

function testCaseData(input: ReturnType<typeof normalizeTestCaseInput>) {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    gherkin: input.gherkin,
    steps: JSON.stringify(input.steps),
  };
}

function bugData(input: ReturnType<typeof normalizeBugInput>) {
  return {
    title: input.title,
    description: input.description,
    severity: input.severity,
    status: input.status,
    stepsToReproduce: JSON.stringify(input.stepsToReproduce),
    expected: input.expected,
    observed: input.observed,
  };
}

function testCaseHash(
  input: ReturnType<typeof normalizeTestCaseInput>,
  references: ReturnType<typeof normalizeQaContextReferences>,
): string {
  const content = JSON.stringify({ ...input, contextReferences: references });
  return createHash("sha256").update(content).digest("hex");
}

function normalizedEditableTestCaseStatus(value: unknown): "DRAFT" | "READY" | "ARCHIVED" {
  if (value === undefined || value === "DRAFT") return "DRAFT";
  if (value === "READY" || value === "ARCHIVED") return value;
  throw new QaValidationError("status no es válido para edición manual.");
}

function optionalId(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new QaValidationError(`${name} no es válido.`);
  }
  return value.trim();
}

function parseJsonArray(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new QaValidationError("Las referencias de contexto persistidas no son válidas.");
    return parsed;
  } catch {
    throw new QaValidationError("Las referencias de contexto persistidas no se pudieron validar.");
  }
}

async function assertRequirements(ids: string[]) {
  if (!ids.length) return;
  const found = await prisma.requirement.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new QaValidationError("Uno o más requisitos asociados no existen.");
}

async function assertSuites(ids: string[]) {
  if (!ids.length) return;
  const found = await prisma.testSuite.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new QaValidationError("Una o más suites asociadas no existen.");
}

async function assertPlans(ids: string[]) {
  if (!ids.length) return;
  const found = await prisma.testPlan.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new QaValidationError("Uno o más planes asociados no existen.");
}

async function assertTestCases(ids: string[]) {
  if (!ids.length) return;
  const found = await prisma.testCase.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new QaValidationError("Uno o más casos asociados no existen.");
}

async function assertBugReferences(testCaseId: string | null, runnerExecutionId: string | null) {
  if (testCaseId && !await prisma.testCase.findUnique({ where: { id: testCaseId }, select: { id: true } })) {
    throw new QaValidationError("El caso de prueba asociado no existe.");
  }
  if (runnerExecutionId && !await prisma.runnerExecution.findUnique({ where: { id: runnerExecutionId }, select: { id: true } })) {
    throw new QaValidationError("La ejecución del Runner asociada no existe.");
  }
}
