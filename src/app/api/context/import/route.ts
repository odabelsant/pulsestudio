import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 80;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const SUPPORTED_EXTENSIONS = new Set([
  "css", "csv", "docx", "env", "html", "htm", "java", "js", "json", "jsx", "md", "mdx",
  "pdf", "php", "py", "rb", "rs", "sh", "sql", "svg", "text", "toml", "ts", "tsx",
  "txt", "vue", "word", "xml", "yaml", "yml",
]);

function safeProjectName(value: FormDataEntryValue | null) {
  const name = typeof value === "string" ? value.trim() : "";
  return (name || "Proyecto importado").slice(0, 120);
}

function safeRelativePath(value: unknown, fallback: string) {
  const candidate = typeof value === "string" ? value.replace(/\\/g, "/") : fallback;
  const normalized = candidate.replace(/^\/+/, "").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
  return (normalized || fallback).slice(0, 240);
}

function extension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

async function extractText(file: File): Promise<string> {
  const fileExtension = extension(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (fileExtension === "pdf") {
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (fileExtension === "docx" || fileExtension === "word") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  const text = buffer.toString("utf8");
  return fileExtension === "html" || fileExtension === "htm"
    ? decodeHtmlEntities(text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ").trim())
    : text;
}

function isSupportedFile(file: File) {
  return file.type.startsWith("text/") ||
    file.type === "application/json" ||
    SUPPORTED_EXTENSIONS.has(extension(file));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!files.length) return NextResponse.json({ error: "Selecciona al menos un archivo." }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `El límite es de ${MAX_FILES} archivos por importación.` }, { status: 400 });

    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) return NextResponse.json({ error: "La importación supera el límite total de 8 MB." }, { status: 400 });

    let suppliedPaths: unknown[] = [];
    try {
      suppliedPaths = JSON.parse(String(form.get("paths") ?? "[]"));
    } catch {
      return NextResponse.json({ error: "Las rutas de los archivos no son válidas." }, { status: 400 });
    }

    const notebookIdValue = form.get("notebookId");
    const notebookId = typeof notebookIdValue === "string" && notebookIdValue.trim()
      ? notebookIdValue.trim()
      : undefined;
    let notebook = notebookId
      ? await prisma.contextNotebook.findUnique({ where: { id: notebookId }, select: { id: true, title: true } })
      : null;
    if (notebookId && !notebook) {
      return NextResponse.json({ error: "El cuaderno seleccionado ya no existe." }, { status: 404 });
    }
    if (!notebook) {
      const title = safeProjectName(form.get("projectName"));
      notebook = await prisma.contextNotebook.findFirst({ where: { title }, select: { id: true, title: true } }) ??
        await prisma.contextNotebook.create({ data: { title }, select: { id: true, title: true } });
    }

    const documents = [];
    for (const [index, file] of files.entries()) {
      if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: `${file.name} supera el límite de 1 MB por archivo.` }, { status: 400 });
      if (!isSupportedFile(file)) {
        return NextResponse.json({ error: `${file.name}: sólo se admiten .md, .pdf, .docx/.word y .html.` }, { status: 400 });
      }
      let content: string;
      try {
        content = await extractText(file);
      } catch (error) {
        console.error(`Context extraction failed for ${file.name}`, error);
        return NextResponse.json({ error: `No se pudo extraer texto de ${file.name}. Comprueba que el archivo no esté dañado.` }, { status: 400 });
      }
      if (!content.trim()) continue;
      documents.push({
        projectName: notebook.title,
        moduleName: safeRelativePath(suppliedPaths[index], file.name),
        markdownContent: content.slice(0, MAX_FILE_BYTES),
        sourceType: extension(file),
        notebookId: notebook.id,
      });
    }

    if (!documents.length) return NextResponse.json({ error: "No se encontraron archivos de texto con contenido." }, { status: 400 });
    const created = await prisma.$transaction(documents.map((data) => prisma.contextDocument.create({ data })));
    return NextResponse.json({ documents: created }, { status: 201 });
  } catch (error) {
    console.error("Context import failed", error);
    return NextResponse.json({ error: "No se pudieron importar los archivos. Comprueba que la base local esté inicializada." }, { status: 500 });
  }
}
