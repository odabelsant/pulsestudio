import { promises as fs } from "node:fs";
import path from "node:path";

export type BrainArtifact = {
  id: string;
  name: string;
  description: string;
  prompt: string;
};

const BRAIN_ROOT = path.join(process.cwd(), "brain");

function artifactDirectory(kind: "agents" | "skills") {
  return path.join(BRAIN_ROOT, kind);
}

function safeId(value: string) {
  return /^[a-z0-9-]+$/.test(value) ? value : undefined;
}

function parseArtifact(id: string, source: string): BrainArtifact {
  const lines = source.trim().split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim() || id;
  const description = lines.find((line) => line.startsWith("> "))?.slice(2).trim() || "Instrucciones locales.";
  const prompt = lines
    .filter((line) => !line.startsWith("# ") && !line.startsWith("> "))
    .join("\n")
    .trim();

  return { id, name: title, description, prompt };
}

async function listArtifacts(kind: "agents" | "skills") {
  try {
    const entries = await fs.readdir(artifactDirectory(kind), { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
    return await Promise.all(
      files.map(async (file) => {
        const id = file.name.slice(0, -3);
        return parseArtifact(id, await fs.readFile(path.join(artifactDirectory(kind), file.name), "utf8"));
      }),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readArtifact(kind: "agents" | "skills", id: string) {
  const validId = safeId(id);
  if (!validId) return undefined;
  try {
    return parseArtifact(validId, await fs.readFile(path.join(artifactDirectory(kind), `${validId}.md`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function getBrainCatalog() {
  const [agents, skills] = await Promise.all([listArtifacts("agents"), listArtifacts("skills")]);
  return { agents, skills };
}

export async function buildBrainInstructions(agentId?: string, skillIds: string[] = []) {
  const agent = agentId ? await readArtifact("agents", agentId) : undefined;
  const skills = (await Promise.all(skillIds.slice(0, 6).map((id) => readArtifact("skills", id)))).filter(
    (skill): skill is BrainArtifact => Boolean(skill),
  );
  return [agent?.prompt, ...skills.map((skill) => skill.prompt)].filter(Boolean).join("\n\n");
}
