import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createProposal } from "@/lib/change-control";
import { activeProjectProfile } from "@/lib/project-profiles";
import { runApprovedJob, type RunResult } from "@/lib/runner";

const MAX_PROPOSALS = 6;
const dataDirectory = path.join(process.cwd(), "data");
const reportFile = path.join(dataDirectory, "night-maintenance.json");
type Task = { title?: string; rationale?: string; risk?: string; diff?: string; verification?: string };

async function workspaceSnapshot(workspace: string) {
  const names = await fs.readdir(workspace, { withFileTypes: true });
  const files = names.filter((entry) => entry.isFile() && ["package.json", "README.md", "tsconfig.json"].includes(entry.name)).map((entry) => entry.name);
  const content = await Promise.all(files.map(async (file) => `${file}:\n${(await fs.readFile(path.join(workspace, file), "utf8")).slice(0, 12_000)}`));
  return { files: names.filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules").map((entry) => entry.name).slice(0, 200), content: content.join("\n\n") };
}

export async function lastMaintenanceReport() {
  try { return JSON.parse(await fs.readFile(reportFile, "utf8")); } catch { return null; }
}

export async function runNightMaintenance() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("Configura GOOGLE_GENERATIVE_AI_API_KEY para el mantenimiento nocturno con Gemini.");
  const profile = activeProjectProfile();
  const [lint, build] = await Promise.all([runApprovedJob("lint"), runApprovedJob("build")]);
  const report: { at: string; profile: string; baseline: RunResult[]; proposals: { id?: string; title: string; rationale: string; verification: string; status: string }[] } = { at: new Date().toISOString(), profile: profile.name, baseline: [lint, build], proposals: [] };
  if (lint.exitCode !== 0 || build.exitCode !== 0 || lint.timedOut || build.timedOut) {
    await saveReport(report);
    return report;
  }
  const snapshot = await workspaceSnapshot(profile.workspace);
  const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  const result = await generateText({
    model: google.generativeAI("gemini-flash-latest"),
    prompt: `Eres un mantenedor nocturno extremadamente conservador. Analiza este proyecto y responde sólo JSON: {"tasks":[{"title":"","rationale":"","risk":"low","verification":"","diff":""}]}. Máximo ${MAX_PROPOSALS} tareas. Sólo deuda técnica pequeña, accesibilidad, tipos, tests o documentación. Nunca propongas borrados, dependencias, migraciones, secretos, cambios de seguridad, cambios de diseño grandes ni cambios fuera del workspace. Incluye diff unificado sólo si la evidencia es suficiente; si no, deja diff vacío. Los diffs nunca se aplicarán automáticamente.\n\nArchivos: ${snapshot.files.join(", ")}\n\nContenido seguro:\n${snapshot.content}`,
  });
  let tasks: Task[] = [];
  try {
    const cleaned = result.text.replace(/^```json\n|\n```$/gm, "").trim();
    tasks = (JSON.parse(cleaned).tasks ?? []);
  } catch { /* Keep an auditable empty report when the model returns invalid JSON. */ }
  for (const task of tasks.slice(0, MAX_PROPOSALS)) {
    if (task.risk !== "low" || !task.title || !task.rationale) continue;
    try {
      const item = task.diff ? createProposal(task.title, task.diff) : undefined;
      report.proposals.push({ id: item?.id, title: task.title, rationale: task.rationale, verification: task.verification ?? "Revisión humana requerida.", status: item ? "pendiente de revisión" : "análisis sin diff" });
    } catch { report.proposals.push({ title: task.title, rationale: task.rationale, verification: task.verification ?? "Revisión humana requerida.", status: "diff rechazado por las reglas de seguridad" }); }
  }
  await saveReport(report);
  return report;
}

async function saveReport(report: unknown) { await fs.mkdir(dataDirectory, { recursive: true }); await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8"); }
