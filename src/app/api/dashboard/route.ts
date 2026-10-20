import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;

  try {
    const [
      requirements,
      testCases,
      testPlans,
      testSuites,
      bugs,
      openBugs,
      chatSessions,
      agentActions,
      runnerExecutions,
      contextDocuments,
    ] = await Promise.all([
      prisma.requirement.count(),
      prisma.testCase.count(),
      prisma.testPlan.count(),
      prisma.testSuite.count(),
      prisma.bug.count(),
      prisma.bug.count({ where: { status: { in: ["OPEN", "TRIAGED"] } } }),
      prisma.chatSession.count(),
      prisma.agentActionLog.count(),
      prisma.runnerExecution.count(),
      prisma.contextDocument.count(),
    ]);

    const productivityLogs = await prisma.agentActionLog.findMany({
      where: { action: "productivity.metric" },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { testCases: true },
    });

    const productivityTotals = {
      created: 0,
      updated: 0,
      deleted: 0,
      approved: 0,
      rejected: 0,
      exported: 0,
      context_uploaded: 0,
      agent_step: 0,
    };

    for (const log of productivityLogs) {
      try {
        const parsed: unknown = JSON.parse(log.testCases);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        const kind = (parsed as Record<string, unknown>).kind;
        const count = (parsed as Record<string, unknown>).count;
        if (typeof kind !== "string" || !(kind in productivityTotals)) continue;
        productivityTotals[kind as keyof typeof productivityTotals] += typeof count === "number" ? count : 1;
      } catch {
        continue;
      }
    }

    const [recentRunner, recentAgent] = await Promise.all([
      prisma.runnerExecution.findMany({
        orderBy: { startedAt: "desc" },
        take: 5,
        select: { id: true, job: true, status: true, startedAt: true },
      }),
      prisma.agentActionLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, action: true, status: true, createdAt: true },
      }),
    ]);

    return NextResponse.json({
      qa: {
        requirements,
        testCases,
        testPlans,
        testSuites,
        bugs,
        openBugs,
      },
      workspace: {
        chatSessions,
        agentActions,
        runnerExecutions,
        contextDocuments,
      },
      recent: {
        runnerExecutions: recentRunner,
        agentActions: recentAgent,
      },
      productivity: productivityTotals,
    });
  } catch {
    console.error("Dashboard summary failed");
    return NextResponse.json({ error: "No se pudo cargar el resumen del espacio de trabajo." }, { status: 500 });
  }
}
