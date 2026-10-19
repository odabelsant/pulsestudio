import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apply, approve, createProposal, proposal, publish, review, rollback, type ReviewRole } from "@/lib/change-control";
export const runtime = "nodejs";
function authorized(request: Request) { const expected = process.env.PULSE_ADMIN_TOKEN; const received = request.headers.get("x-pulse-admin-token"); return Boolean(expected && received && expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received))); }
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Token administrativo inválido o ausente." }, { status: 401 });
  try { const body = await request.json() as { action?: string; id?: string; title?: string; diff?: string; role?: ReviewRole; verdict?: "approved" | "changes_requested"; notes?: string; person?: string };
    if (body.action === "create") return NextResponse.json(createProposal(body.title ?? "", body.diff ?? ""));
    if (!body.id) throw new Error("Falta el id de la propuesta.");
    if (body.action === "review" && body.role && body.verdict) return NextResponse.json(review(body.id, body.role, body.verdict, body.notes ?? ""));
    if (body.action === "approve") return NextResponse.json(approve(body.id, body.person ?? ""));
    if (body.action === "apply") return NextResponse.json(await apply(body.id));
    if (body.action === "rollback") return NextResponse.json(await rollback(body.id));
    if (body.action === "publish") return NextResponse.json(await publish(body.id));
    return NextResponse.json(proposal(body.id));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo procesar la propuesta." }, { status: 400 }); }
}
