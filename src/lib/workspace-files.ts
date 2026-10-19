import { constants } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { configuredWorkspace } from "@/lib/runner";

const MAX_FILE_SIZE = 1_000_000;
const MAX_FILES = 500;
const IGNORED_DIRECTORIES = new Set([".git", ".next", "node_modules", "dist", "build", "coverage", "vendor"]);
const ALLOWED_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".scss", ".sh",
  ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

function isSensitiveName(name: string) {
  return /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)|.*(?:secret|credential|token|private[-_]?key).*)$/i.test(name);
}

function isInsideRoot(root: string, candidate: string) {
  return candidate !== root && candidate.startsWith(`${root}${path.sep}`);
}

function validateRelativePath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Indica una ruta relativa válida dentro del workspace.");
  }
  if (normalized.split("/").some(isSensitiveName)) {
    throw new Error("El IDE no permite abrir ni editar archivos con nombres asociados a secretos.");
  }
  if (!ALLOWED_EXTENSIONS.has(path.extname(normalized).toLowerCase())) {
    throw new Error("El IDE sólo admite archivos de código y texto permitidos.");
  }
  return normalized;
}

async function getWorkspaceRoot() {
  const root = await realpath(configuredWorkspace());
  const rootInfo = await stat(root);
  if (!rootInfo.isDirectory()) throw new Error("El workspace configurado no es una carpeta.");
  return root;
}

async function resolveWorkspaceFile(relativePath: string) {
  const safePath = validateRelativePath(relativePath);
  const root = await getWorkspaceRoot();
  const segments = safePath.split("/");
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const isLast = index === segments.length - 1;
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("No se permiten enlaces simbólicos en el workspace IDE.");
    if (!isLast && !info.isDirectory()) throw new Error("La ruta del archivo contiene un segmento que no es carpeta.");
    if (isLast && !info.isFile()) throw new Error("La ruta seleccionada no es un archivo regular.");
    const resolved = await realpath(current);
    if (resolved !== root && !isInsideRoot(root, resolved)) {
      throw new Error("La ruta debe permanecer dentro del workspace.");
    }
  }
  return { root, filePath: current, safePath };
}

export async function listWorkspaceFiles() {
  const root = await getWorkspaceRoot();
  const files: string[] = [];

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    if (files.length >= MAX_FILES) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.isSymbolicLink()) continue;
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name) && !isSensitiveName(entry.name)) {
          await visit(path.join(directory, entry.name), relativePath);
        }
      } else if (
        entry.isFile() &&
        !isSensitiveName(entry.name) &&
        ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        files.push(relativePath);
      }
    }
  }

  await visit(root, "");
  files.sort((left, right) => left.localeCompare(right));
  return { workspace: root, files, truncated: files.length === MAX_FILES };
}

export async function readWorkspaceFile(relativePath: string) {
  const { filePath, safePath } = await resolveWorkspaceFile(relativePath);
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("La ruta seleccionada no es un archivo regular.");
    if (info.size > MAX_FILE_SIZE) throw new Error("El archivo supera el límite de 1 MB para edición.");
    return { path: safePath, content: await file.readFile("utf8") };
  } finally {
    await file.close();
  }
}

export async function writeWorkspaceFile(relativePath: string, content: string) {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_SIZE) {
    throw new Error("El contenido supera el límite de 1 MB para edición.");
  }
  const { filePath, safePath } = await resolveWorkspaceFile(relativePath);
  const file = await open(filePath, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW);
  try {
    await file.writeFile(content, "utf8");
  } finally {
    await file.close();
  }
  return { path: safePath, saved: true };
}
