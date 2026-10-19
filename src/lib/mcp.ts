import fs from "fs";
import path from "path";

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "data");

// Priority workspace roots from environment variables (absolute paths)
const AGENTS_WORKSPACE = process.env.AGENTS_WORKSPACE_PATH ?? "";
const PORTFOLIO_WORKSPACE = process.env.PORTFOLIO_WORKSPACE_PATH ?? "";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function ensureDataDir() {
  ensureDir(DATA_DIR);
}

// Resolve a path with workspace priority: first check AGENTS, then PORTFOLIO, then project
function resolveWithPriority(relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new Error("Only relative paths inside a configured workspace are allowed.");
  }
  const candidates: string[] = [];
  if (AGENTS_WORKSPACE) candidates.push(path.join(AGENTS_WORKSPACE, relativePath));
  if (PORTFOLIO_WORKSPACE) candidates.push(path.join(PORTFOLIO_WORKSPACE, relativePath));
  candidates.push(path.join(PROJECT_ROOT, relativePath));

  for (const p of candidates) {
    const root = path.dirname(p);
    const resolved = path.resolve(p);
    if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) continue;
    if (fs.existsSync(resolved)) return resolved;
  }

  // default to project path if none exist
  return path.join(PROJECT_ROOT, relativePath);
}

export function readLocalFile(relativePath: string): string {
  const filePath = resolveWithPriority(relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

export function writeLocalFile(relativePath: string, contents: string): void {
  // writes always go to project data dir to avoid accidental modification of user home files
  ensureDataDir();
  const safePath = path.join(DATA_DIR, relativePath);
  const dir = path.dirname(safePath);
  ensureDir(dir);
  fs.writeFileSync(safePath, contents, "utf-8");
}
