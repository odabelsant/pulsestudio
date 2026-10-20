import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localApiAuthorizationError } from "@/lib/local-api-auth";
import type { ProductivityMetricKind } from "@/lib/productivity-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METRIC_ACTION = "productivity.metric";
const ALLOWED_KINDS = new Set<ProductivityMetricKind>([
  "created",
  "updated",
  "deleted",
  "approved",
  "rejected",
  "exported",
  "context_uploaded",
  "agent_step",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;

  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.kind !== "string" || !ALLOWED_KINDS.has(body.kind as ProductivityMetricKind)) {
      return NextResponse.json({ error: "Métrica inválida." }, { status: 400 });
    }

    const payload = {
      kind: body.kind,
      entity: typeof body.entity === "string" ? body.entity : null,
      label: typeof body.label === "string" ? body.label.slice(0, 200) : null,
      count: typeof body.count === "number" && body.count > 0 ? Math.floor(body.count) : 1,
      at: new Date().toISOString(),
    };

    await prisma.agentActionLog.create({
      data: {
        action: METRIC_ACTION,
        status: "COMPLETED",
        testCases: JSON.stringify(payload),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    console.error("Productivity metric persist failed");
    return NextResponse.json({ error: "No se pudo registrar la métrica." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;

  try {
    const logs = await prisma.agentActionLog.findMany({
      where: { action: METRIC_ACTION },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { testCases: true, createdAt: true },
    });

    const totals: Record<ProductivityMetricKind, number> = {
      created: 0,
      updated: 0,
      deleted: 0,
      approved: 0,
      rejected: 0,
      exported: 0,
      context_uploaded: 0,
      agent_step: 0,
    };

    for (const log of logs) {
      try {
        const parsed: unknown = JSON.parse(log.testCases);
        if (!isRecord(parsed) || typeof parsed.kind !== "string") continue;
        const kind = parsed.kind as ProductivityMetricKind;
        if (!ALLOWED_KINDS.has(kind)) continue;
        const count = typeof parsed.count === "number" ? parsed.count : 1;
        totals[kind] += count;
      } catch {
        continue;
      }
    }

    return NextResponse.json({ totals, samples: logs.length });
  } catch {
    console.error("Productivity metrics read failed");
    return NextResponse.json({ error: "No se pudieron leer las métricas." }, { status: 500 });
  }
}
