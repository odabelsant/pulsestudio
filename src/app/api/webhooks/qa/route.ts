import { NextResponse } from "next/server";
import { adminApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const authorizationError = adminApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
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
  } catch {
    console.error("webhook qa processing failed");
    return NextResponse.json({ error: "Error interno al procesar la historia." }, { status: 500 });
  }
}