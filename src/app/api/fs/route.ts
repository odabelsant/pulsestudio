import { NextResponse } from "next/server";
import { readLocalFile } from '@/lib/mcp';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  try {
    const content = readLocalFile(path);
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo leer el archivo.' }, { status: 400 });
  }
}
