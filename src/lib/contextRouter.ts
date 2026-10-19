import { prisma } from "@/lib/prisma";

export interface RoutedContextFragment {
  documentId: string;
  title: string;
  tags: string[];
  fragment: string;
  score: number;
}

interface DocumentRow {
  id: string;
  projectName: string;
  moduleName: string;
  markdownContent: string;
  tags: string;
}

const STOP_WORDS = new Set([
  "con", "del", "para", "por", "las", "los", "una", "uno", "que", "como",
  "sobre", "reglas", "regla", "guia", "guías", "contexto", "caso", "casos",
  "prueba", "pruebas", "crear", "generar", "aplicar",
]);
const MAX_FRAGMENT_LENGTH = 900;
const MAX_FRAGMENTS = 3;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function keywords(value: string): string[] {
  return [...new Set(
    normalize(value)
      .match(/[a-z0-9_-]{3,}/g)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  )];
}

function parseTags(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function extractTitle(document: DocumentRow): string {
  const heading = document.markdownContent.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || document.moduleName.split("/").pop() || document.moduleName;
}

function splitMarkdown(markdown: string): string[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const sections = normalized.split(/(?=^#{1,6}\s+)/m);
  return sections.flatMap((section) => {
    const blocks = section.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
    if (blocks.length <= 1) return blocks;
    const heading = blocks[0].startsWith("#") ? blocks.shift() : undefined;
    return blocks.map((block) => [heading, block].filter(Boolean).join("\n"));
  });
}

function scoreText(text: string, queryTerms: string[]): number {
  const normalized = normalize(text);
  return queryTerms.reduce((score, term) => {
    if (!normalized.includes(term)) return score;
    return score + (new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(normalized) ? 3 : 1);
  }, 0);
}

function trimFragment(value: string): string {
  if (value.length <= MAX_FRAGMENT_LENGTH) return value;
  const cutoff = value.lastIndexOf(" ", MAX_FRAGMENT_LENGTH - 1);
  return `${value.slice(0, cutoff > 250 ? cutoff : MAX_FRAGMENT_LENGTH).trim()}…`;
}

export async function routeContext(
  query: string,
  options: { tags?: string[]; limit?: number; notebookId?: string } = {},
): Promise<RoutedContextFragment[]> {
  const queryTerms = keywords(query);
  if (queryTerms.length === 0) return [];

  const documents = await prisma.contextDocument.findMany({
    where: options.notebookId ? { notebookId: options.notebookId } : undefined,
    select: {
      id: true,
      projectName: true,
      moduleName: true,
      markdownContent: true,
      tags: true,
    },
    orderBy: { createdAt: "desc" },
  }) as DocumentRow[];

  const candidates: RoutedContextFragment[] = [];
  for (const document of documents) {
    const tags = parseTags(document.tags);
    const title = extractTitle(document);
    const metadata = `${document.projectName} ${document.moduleName} ${title} ${tags.join(" ")}`;
    const metadataScore = scoreText(metadata, queryTerms);
    const tagScore = tags.reduce((total, tag) => {
      const normalizedTag = normalize(tag);
      const queryMatch = queryTerms.some((term) => normalizedTag.includes(term));
      const requestedMatch = options.tags?.some((requested) => normalize(requested) === normalizedTag) ?? false;
      return total + (queryMatch ? 5 : 0) + (requestedMatch ? 4 : 0);
    }, 0);

    for (const fragment of splitMarkdown(document.markdownContent)) {
      const fragmentScore = scoreText(fragment, queryTerms);
      const score = metadataScore + tagScore + fragmentScore;
      if (score <= 0) continue;
      candidates.push({
        documentId: document.id,
        title: `${document.projectName} / ${title}`,
        tags,
        fragment: trimFragment(fragment),
        score,
      });
    }
  }

  const limit = Math.max(1, Math.min(options.limit ?? MAX_FRAGMENTS, MAX_FRAGMENTS));
  const uniqueByDocument = new Set<string>();
  return candidates
    .sort((left, right) => right.score - left.score || left.fragment.length - right.fragment.length)
    .filter((candidate) => {
      if (uniqueByDocument.has(candidate.documentId)) return false;
      uniqueByDocument.add(candidate.documentId);
      return true;
    })
    .slice(0, limit);
}
