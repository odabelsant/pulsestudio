import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { listProjectProfiles, saveProjectProfile } from "@/lib/project-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.PULSE_ADMIN_TOKEN;
  const received = request.headers.get("x-pulse-admin-token");
  return Boolean(expected && received && expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received)));
}

export function GET() { return NextResponse.json({ projects: listProjectProfiles() }); }

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Token administrativo inválido o ausente." }, { status: 401 });
  try {
    const body = await request.json() as { id?: string; name?: string; workspace?: string; active?: boolean };
    if (!body.name || !body.workspace) return NextResponse.json({ error: "name y workspace son requeridos." }, { status: 400 });
    return NextResponse.json(saveProjectProfile({ id: body.id, name: body.name!, workspace: body.workspace!, active: body.active }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el proyecto." }, { status: 400 });
  }
}
