import { NextResponse } from "next/server";
import { apply, approve, createProposal, proposal, publish, review, rollback, type ReviewRole } from "@/lib/change-control";
import { adminApiAuthorizationError, localApiAuthorizationError } from "@/lib/local-api-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const sessionError = localApiAuthorizationError(request);
  if (sessionError) return sessionError;
  const adminError = adminApiAuthorizationError(request);
  if (adminError) return adminError;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 });
  try {
    if (body.action === "create") {
      if (typeof body.title !== "string" || typeof body.diff !== "string") {
        return NextResponse.json({ error: "Título y diff son obligatorios." }, { status: 400 });
      }
      return NextResponse.json(await createProposal(body.title, body.diff));
    }
    if (typeof body.id !== "string" || !body.id) throw new Error("Falta el id de la propuesta.");
    if (body.action === "review" && isReviewRole(body.role) && isReviewVerdict(body.verdict)) {
      if (body.notes !== undefined && typeof body.notes !== "string") {
        return NextResponse.json({ error: "Las notas de revisión deben ser texto." }, { status: 400 });
      }
      return NextResponse.json(await review(body.id, body.role, body.verdict, body.notes ?? ""));
    }
    if (body.action === "approve") {
      if (body.person !== undefined && typeof body.person !== "string") {
        return NextResponse.json({ error: "La persona que aprueba debe ser texto." }, { status: 400 });
      }
      return NextResponse.json(await approve(body.id, body.person ?? ""));
    }
    if (body.action === "apply") return NextResponse.json(await apply(body.id));
    if (body.action === "rollback") return NextResponse.json(await rollback(body.id));
    if (body.action === "publish") return NextResponse.json(await publish(body.id));
    return NextResponse.json(await proposal(body.id));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo procesar la propuesta.",
    }, { status: 400 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewRole(value: unknown): value is ReviewRole {
  return value === "arquitecto" || value === "juez";
}

function isReviewVerdict(value: unknown): value is "approved" | "changes_requested" {
  return value === "approved" || value === "changes_requested";
}
