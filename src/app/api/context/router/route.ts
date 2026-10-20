import { NextResponse } from "next/server";
import { routeRecipe } from "@/lib/recipeRouter";
import { localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Se requiere una consulta de contexto válida." }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  if (typeof value.query !== "string" || !value.query.trim() || value.query.length > 1000) {
    return NextResponse.json({ error: "La consulta debe tener entre 1 y 1000 caracteres." }, { status: 400 });
  }
  if (
    value.tags !== undefined &&
    (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string"))
  ) {
    return NextResponse.json({ error: "Las etiquetas deben ser una lista de texto." }, { status: 400 });
  }
  if (value.notebookId !== undefined && (typeof value.notebookId !== "string" || !value.notebookId.trim())) {
    return NextResponse.json({ error: "El cuaderno indicado no es válido." }, { status: 400 });
  }

  try {
    const routed = await routeRecipe(value.query, {
      notebookId: typeof value.notebookId === "string" ? value.notebookId : undefined,
      tags: Array.isArray(value.tags) ? value.tags as string[] : undefined,
    });
    return NextResponse.json(routed);
  } catch {
    console.error("Context routing failed");
    return NextResponse.json(
      { error: "No se pudo buscar en el contexto del proyecto." },
      { status: 500 },
    );
  }
}
