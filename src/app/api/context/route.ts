import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { localApiAuthorizationError } from '@/lib/local-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validDocument(body: unknown): body is {
  id?: string;
  projectName: string;
  moduleName: string;
  markdownContent: string;
  tags?: string[];
  notebookId?: string;
  sourceType?: string;
} {
  if (!body || typeof body !== 'object') return false
  const value = body as Record<string, unknown>
  return [value.projectName, value.moduleName, value.markdownContent].every((field) => typeof field === 'string' && field.trim().length > 0) &&
    (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string'))) &&
    (value.notebookId === undefined || (typeof value.notebookId === 'string' && Boolean(value.notebookId.trim()))) &&
    (value.sourceType === undefined || (typeof value.sourceType === 'string' && value.sourceType.length <= 80))
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return '[]'
  return JSON.stringify([...new Set(value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase().slice(0, 40))
    .filter(Boolean))].slice(0, 20))
}

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  try {
    const { searchParams } = new URL(request.url)
    const notebookId = searchParams.get("notebookId")
    const documents = await prisma.contextDocument.findMany({
      where: notebookId ? { notebookId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(documents)
  } catch {
    console.error('Context list failed')
    return NextResponse.json({ error: 'No se pudo leer la biblioteca de contexto. Ejecuta npm run db:push.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON body required' }, { status: 400 })
  const { projectName, moduleName, markdownContent, tags, notebookId, sourceType } = body

  if (
    typeof projectName !== 'string' || !projectName.trim() ||
    typeof moduleName !== 'string' || !moduleName.trim() ||
    typeof markdownContent !== 'string' || !markdownContent.trim() ||
    markdownContent.length > 1_000_000 ||
    (notebookId !== undefined && (typeof notebookId !== 'string' || !notebookId.trim())) ||
    (sourceType !== undefined && (typeof sourceType !== 'string' || sourceType.length > 80))
  ) {
    return NextResponse.json({ error: 'projectName, moduleName and markdownContent are required' }, { status: 400 })
  }

  try {
    let targetNotebookId = typeof notebookId === 'string' ? notebookId.trim() : undefined
    if (targetNotebookId) {
      const existingNotebook = await prisma.contextNotebook.findUnique({ where: { id: targetNotebookId }, select: { id: true } })
      if (!existingNotebook) return NextResponse.json({ error: 'El cuaderno seleccionado ya no existe.' }, { status: 404 })
    } else {
      const title = projectName.trim().slice(0, 120)
      const notebook = await prisma.contextNotebook.findFirst({ where: { title }, select: { id: true } }) ??
        await prisma.contextNotebook.create({ data: { title }, select: { id: true } })
      targetNotebookId = notebook.id
    }
    const document = await prisma.contextDocument.create({
      data: {
        projectName: projectName.trim().slice(0, 120),
        moduleName: moduleName.trim().slice(0, 240),
        markdownContent,
        tags: cleanTags(tags),
        notebookId: targetNotebookId,
        ...(typeof sourceType === 'string' ? { sourceType: sourceType.slice(0, 80) } : {}),
      },
    })
    return NextResponse.json(document, { status: 201 })
  } catch {
    console.error('Context create failed')
    return NextResponse.json({ error: 'No se pudo guardar el contexto.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const body = await request.json().catch(() => null)
  if (!validDocument(body) || !body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id, projectName, moduleName and markdownContent are required' }, { status: 400 })
  }
  try {
    const document = await prisma.contextDocument.update({
      where: { id: body.id },
      data: {
        projectName: body.projectName.trim().slice(0, 120),
        moduleName: body.moduleName.trim().slice(0, 240),
        markdownContent: body.markdownContent.slice(0, 1_000_000),
        ...(body.tags === undefined ? {} : { tags: cleanTags(body.tags) }),
        ...(body.notebookId === undefined ? {} : { notebookId: body.notebookId }),
        ...(body.sourceType === undefined ? {} : { sourceType: body.sourceType }),
      },
    })
    return NextResponse.json(document)
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar el contexto.' }, { status: 404 })
  }
}

export async function DELETE(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    await prisma.contextDocument.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 })
  }
}
