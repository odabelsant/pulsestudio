import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.PULSE_ADMIN_TOKEN;
  const received = request.headers.get("x-pulse-admin-token");
  return Boolean(expected && received && expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received)));
}

const VALID_STORY_PROVIDERS = ["n8n", "jira", "azure", "github"];

function validateStoryPayload(body: unknown): body is {
  storyId: string;
  title: string;
  description?: string;
  acceptanceCriteria: string[];
  targetComponent: string;
} {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return (
    typeof value.storyId === "string" &&
    typeof value.title === "string" &&
    typeof value.acceptanceCriteria === "object" &&
    Array.isArray(value.acceptanceCriteria) &&
    typeof value.targetComponent === "string"
  );
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "qa-webhook" });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Token administrativo inválido." }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    if (!body || !validateStoryPayload(body)) {
      return NextResponse.json({ error: "Payload de historia inválido. Esperado: storyId, title, acceptanceCriteria (array), targetComponent." }, { status: 400 });
    }

    const { storyId, title, description, acceptanceCriteria, targetComponent } = body;

    return NextResponse.json({
      success: true,
      received: true,
      storyId,
      message: "Historia de usuario recibida y validada correctamente.",
    });
  } catch (error) {
    console.error("webhook qa error:", error);
    return NextResponse.json({ error: "Error interno al procesar la historia." }, { status: 500 });
  }
}