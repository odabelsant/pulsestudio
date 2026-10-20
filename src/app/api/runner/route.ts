import { NextResponse } from "next/server";
import {
  authorizeRunnerJob,
  RUNNER_JOBS,
  runApprovedJob,
  workspaceStatus,
  type RunnerJob,
} from "@/lib/runner";
import { localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  return NextResponse.json(await workspaceStatus());
}

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.action !== "string") {
    return NextResponse.json({ error: "La acción del Runner no es válida." }, { status: 400 });
  }
  if (!body.job || !RUNNER_JOBS.includes(body.job as RunnerJob)) {
    return NextResponse.json({ error: `Allowed jobs: ${RUNNER_JOBS.join(", ")}.` }, { status: 400 });
  }
  try {
    const job = body.job as RunnerJob;
    if (body.testPath !== undefined && typeof body.testPath !== "string") {
      return NextResponse.json({ error: "La ruta Playwright debe ser texto." }, { status: 400 });
    }
    if (body.action === "authorize") {
      const approval = await authorizeRunnerJob(job, body.testPath);
      return NextResponse.json({
        approvalId: approval.id,
        contentHash: approval.contentHash,
        expiresAt: approval.expiresAt,
        target: approval.target,
      });
    }
    if (body.action === "execute") {
      if (typeof body.approvalId !== "string") {
        return NextResponse.json({ error: "Se requiere la aprobación emitida por el servidor." }, { status: 403 });
      }
      return NextResponse.json(await runApprovedJob(job, body.testPath, body.approvalId));
    }
    return NextResponse.json({ error: "Usa la acción authorize o execute." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Runner failed." },
      { status: 400 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
