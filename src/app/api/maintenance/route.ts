import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { lastMaintenanceReport, runNightMaintenance } from "@/lib/night-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorized(request: Request) { const expected = process.env.PULSE_ADMIN_TOKEN; const received = request.headers.get("x-pulse-admin-token"); return Boolean(expected && received && expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received))); }
export async function GET() { return NextResponse.json({ report: await lastMaintenanceReport(), maxProposals: 6, provider: "gemini" }); }
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Token administrativo inválido o ausente." }, { status: 401 });
  try { return NextResponse.json(await runNightMaintenance()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo ejecutar el mantenimiento." }, { status: 500 }); }
}
