import { NextResponse } from "next/server";
import { listProjectProfiles, saveProjectProfile } from "@/lib/project-profiles";
import { adminApiAuthorizationError, localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  return NextResponse.json({ projects: listProjectProfiles() });
}

export async function POST(request: Request) {
  const sessionError = localApiAuthorizationError(request);
  if (sessionError) return sessionError;
  const adminError = adminApiAuthorizationError(request);
  if (adminError) return adminError;
  try {
    const body = await request.json() as { id?: string; name?: string; workspace?: string; active?: boolean };
    if (!body.name || !body.workspace) return NextResponse.json({ error: "name y workspace son requeridos." }, { status: 400 });
    return NextResponse.json(saveProjectProfile({ id: body.id, name: body.name!, workspace: body.workspace!, active: body.active }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el proyecto." }, { status: 400 });
  }
}
