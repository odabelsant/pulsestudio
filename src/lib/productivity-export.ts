import type { QaEntity } from "@/lib/qa-domain";

type ExportRecord = Record<string, unknown> & { id: string };

const ENTITY_LABEL: Record<QaEntity, string> = {
  requirements: "Requirements",
  "test-cases": "Test Cases",
  "test-plans": "Test Plans",
  "test-suites": "Test Suites",
  bugs: "Bugs",
};

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function primaryLabel(record: ExportRecord): string {
  if (typeof record.title === "string" && record.title) return record.title;
  if (typeof record.name === "string" && record.name) return record.name;
  return record.id;
}

export function buildMarkdownExport(entity: QaEntity, records: ExportRecord[]): string {
  const lines = [
    `# PulseStudio · ${ENTITY_LABEL[entity]}`,
    "",
    `_Exportado: ${new Date().toISOString()}_`,
    "",
  ];
  if (!records.length) {
    lines.push("_No hay registros locales en esta entidad._");
    return `${lines.join("\n")}\n`;
  }
  for (const record of records) {
    lines.push(`## ${primaryLabel(record)}`, "");
    lines.push(`- **ID:** ${record.id}`);
    if (typeof record.status === "string") lines.push(`- **Estado:** ${record.status}`);
    if (typeof record.description === "string" && record.description) {
      lines.push("", record.description);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function buildCsvExport(entity: QaEntity, records: ExportRecord[]): string {
  const headers = ["id", "title_or_name", "status", "description"];
  const rows = records.map((record) => [
    record.id,
    primaryLabel(record),
    typeof record.status === "string" ? record.status : "",
    typeof record.description === "string" ? record.description.replace(/\n/g, " ") : "",
  ]);
  return [
    `# entity=${entity}`,
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
