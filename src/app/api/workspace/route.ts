import { NextResponse } from "next/server";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from "@/lib/workspace-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");
    return NextResponse.json(filePath ? await readWorkspaceFile(filePath) : await listWorkspaceFiles());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo acceder al workspace." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_100_000) {
    return NextResponse.json({ error: "El contenido supera el límite de 1 MB para edición." }, { status: 413 });
  }
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("path" in body) ||
      typeof body.path !== "string" ||
      !("content" in body) ||
      typeof body.content !== "string"
    ) {
      return NextResponse.json({ error: "Se requieren una ruta relativa y el contenido del archivo." }, { status: 400 });
    }
    return NextResponse.json(await writeWorkspaceFile(body.path, body.content));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el archivo." },
      { status: 400 },
    );
  }
}
