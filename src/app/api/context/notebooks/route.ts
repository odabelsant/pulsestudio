import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNotebookBody(value: unknown): { id?: string; title: string; notes?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 120) return null;
  if (body.id !== undefined && (typeof body.id !== "string" || !body.id.trim())) return null;
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 100_000)) return null;
  return {
    ...(typeof body.id === "string" ? { id: body.id.trim() } : {}),
    title: body.title.trim(),
    ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
  };
}

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  try {
    const notebooks = await prisma.contextNotebook.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { documents: true } } },
    });
    return NextResponse.json(notebooks);
  } catch {
    console.error("Context notebook list failed");
    return NextResponse.json({ error: "No se pudieron cargar los cuadernos de contexto." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const body: unknown = await request.json().catch(() => null);
  const notebook = parseNotebookBody(body);
  if (!notebook || notebook.id) {
    return NextResponse.json({ error: "El título del cuaderno es obligatorio (máximo 120 caracteres)." }, { status: 400 });
  }
  try {
    const created = await prisma.contextNotebook.create({
      data: { title: notebook.title, notes: notebook.notes ?? "" },
    });
    return NextResponse.json(created, { status: 201 });
  } catch {
    console.error("Context notebook create failed");
    return NextResponse.json({ error: "No se pudo crear el cuaderno." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const body: unknown = await request.json().catch(() => null);
  const notebook = parseNotebookBody(body);
  if (!notebook?.id) {
    return NextResponse.json({ error: "Se requieren un id y un título válido para actualizar el cuaderno." }, { status: 400 });
  }
  try {
    const updated = await prisma.contextNotebook.update({
      where: { id: notebook.id },
      data: {
        title: notebook.title,
        ...(notebook.notes === undefined ? {} : { notes: notebook.notes }),
      },
    });
    return NextResponse.json(updated);
  } catch {
    console.error("Context notebook update failed");
    return NextResponse.json({ error: "No se pudo actualizar el cuaderno." }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Se requiere el id del cuaderno." }, { status: 400 });
  try {
    await prisma.contextNotebook.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("Context notebook delete failed");
    return NextResponse.json({ error: "No se pudo eliminar el cuaderno." }, { status: 404 });
  }
}
