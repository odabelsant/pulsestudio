import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminApiAuthorizationError, localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizationError(request: Request) {
  return localApiAuthorizationError(request) ?? adminApiAuthorizationError(request);
}

export async function GET(request: Request) {
  const error = authorizationError(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const revealId = searchParams.get("reveal");

  try {
    if (revealId) {
      const item = await prisma.environmentVariable.findUnique({
        where: { id: revealId },
      });
      if (!item) {
        return NextResponse.json({ error: "Variable no encontrada." }, { status: 404 });
      }
      return NextResponse.json({ id: item.id, key: item.key, value: item.value });
    }

    const variables = await prisma.environmentVariable.findMany({
      orderBy: { createdAt: "desc" },
    });

    const formatted = variables.map((v) => {
      let parsedEnvs: string[] = ["development", "preview", "production"];
      try {
        if (v.environments) {
          const parsed = JSON.parse(v.environments);
          if (Array.isArray(parsed) && parsed.length > 0) parsedEnvs = parsed;
        }
      } catch {
        // fallback
      }

      const masked = v.value.length > 4 ? "••••••••" + v.value.slice(-4) : "••••••••";
      return {
        id: v.id,
        key: v.key,
        value: masked,
        environments: parsedEnvs,
        projectId: v.projectId,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      };
    });

    return NextResponse.json(formatted);
  } catch {
    console.error("Error al listar variables.");
    return NextResponse.json({ error: "Error al listar variables." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const error = authorizationError(request);
  if (error) return error;
  try {
    const body = await request.json();
    const { key, value, environments, projectId } = body;
    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json({ error: "El nombre de la variable (Key) es obligatorio." }, { status: 400 });
    }
    if (value === undefined || value === null) {
      return NextResponse.json({ error: "El valor de la variable es obligatorio." }, { status: 400 });
    }

    const envsString = Array.isArray(environments)
      ? JSON.stringify(environments)
      : JSON.stringify(["development", "preview", "production"]);

    const variable = await prisma.environmentVariable.upsert({
      where: { key: key.trim() },
      create: {
        key: key.trim(),
        value: String(value),
        environments: envsString,
        projectId: projectId || undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        value: String(value),
        environments: envsString,
        projectId: projectId || undefined,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      id: variable.id,
      key: variable.key,
      environments: JSON.parse(variable.environments),
      projectId: variable.projectId,
      updatedAt: variable.updatedAt,
    }, { status: 201 });
  } catch {
    console.error("Error al guardar variable.");
    return NextResponse.json({ error: "Error al guardar variable." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const error = authorizationError(request);
  if (error) return error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID de variable requerido." }, { status: 400 });
    }
    await prisma.environmentVariable.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Error al eliminar variable." }, { status: 500 });
  }
}