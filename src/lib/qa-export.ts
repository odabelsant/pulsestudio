import type { QaEntity } from "@/lib/qa-domain";
import { qaRecordSummary } from "@/lib/qa-module-config";

type QaRecord = Record<string, unknown> & { id: string };

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildQaMarkdownExport(entity: QaEntity, records: QaRecord[]): string {
  const lines = [`# Export · ${entity}`, "", `Generado: ${new Date().toISOString()}`, "", `Total: ${records.length}`, ""];
  for (const record of records) {
    lines.push(`## ${qaRecordSummary(entity, record)}`, "", `- ID: ${record.id}`);
    for (const [key, value] of Object.entries(record)) {
      if (key === "id") continue;
      if (value === null || value === undefined || value === "") continue;
      const rendered = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      lines.push(`- **${key}**: ${rendered.replace(/\n/g, " · ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function buildQaCsvExport(entity: QaEntity, records: QaRecord[]): string {
  if (!records.length) return "id,summary\n";
  const keys = Array.from(
    records.reduce((set, record) => {
      Object.keys(record).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const header = keys.join(",");
  const rows = records.map((record) =>
    keys.map((key) => {
      const value = record[key];
      if (value === null || value === undefined) return "";
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return escapeCsv(text);
    }).join(","),
  );
  return [header, ...rows].join("\n");
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
