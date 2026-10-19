import { NextResponse } from "next/server";
import { RUNNER_JOBS, runApprovedJob, workspaceStatus, type RunnerJob } from "@/lib/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await workspaceStatus());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { job?: string; testPath?: string };
  if (!body.job || !RUNNER_JOBS.includes(body.job as RunnerJob)) {
    return NextResponse.json({ error: `Allowed jobs: ${RUNNER_JOBS.join(", ")}.` }, { status: 400 });
  }
  try {
    return NextResponse.json(await runApprovedJob(body.job as RunnerJob, body.testPath));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Runner failed." }, { status: 500 });
  }
}
