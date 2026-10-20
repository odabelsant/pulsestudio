import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { localApiAuthorizationError } from '@/lib/local-api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validAgent(body: unknown): body is { id?: string; name: string; description?: string; systemPrompt?: string } {
  return Boolean(body && typeof body === 'object' && typeof (body as Record<string, unknown>).name === 'string' && (body as Record<string, string>).name.trim())
}

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request)
  if (authorizationError) return authorizationError
  const agents = await prisma.agent.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(agents)
}

export async function POST(request: Request) {
  const authorizationError = localApiAuthorizationError(request)
  if (authorizationError) return authorizationError
  const body = await request.json().catch(() => null)
  if (!validAgent(body)) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  try {
    const agent = await prisma.agent.create({ data: { name: body.name.trim(), description: body.description?.trim() || null, systemPrompt: body.systemPrompt?.trim() || null } })
    return NextResponse.json(agent, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'No se pudo crear el agente.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const authorizationError = localApiAuthorizationError(request)
  if (authorizationError) return authorizationError
  const body = await request.json().catch(() => null)
  if (!validAgent(body) || !body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id and name are required' }, { status: 400 })
  }
  try {
    const agent = await prisma.agent.update({ where: { id: body.id }, data: { name: body.name.trim(), description: body.description?.trim() || null, systemPrompt: body.systemPrompt?.trim() || null } })
    return NextResponse.json(agent)
  } catch {
    return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 })
  }
}

export async function DELETE(request: Request) {
  const authorizationError = localApiAuthorizationError(request)
  if (authorizationError) return authorizationError
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    await prisma.agent.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 })
  }
}
