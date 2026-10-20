import { NextResponse } from "next/server";
import { lastMaintenanceReport, runNightMaintenance } from "@/lib/night-maintenance";
import { adminApiAuthorizationError, localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  return NextResponse.json({ report: await lastMaintenanceReport(), maxProposals: 6, provider: "gemini" });
}
export async function POST(request: Request) {
  const sessionError = localApiAuthorizationError(request);
  if (sessionError) return sessionError;
  const adminError = adminApiAuthorizationError(request);
  if (adminError) return adminError;
  try { return NextResponse.json(await runNightMaintenance()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo ejecutar el mantenimiento." }, { status: 500 }); }
}
