import { NextResponse } from "next/server";
import { localApiAuthorizationError } from "@/lib/local-api-auth";
import { readWorkspaceFile } from "@/lib/workspace-files";

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  try {
    const { content } = await readWorkspaceFile(path);
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo leer el archivo.' }, { status: 400 });
  }
}
