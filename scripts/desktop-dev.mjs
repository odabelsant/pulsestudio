import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const electronBin = path.join(projectRoot, "node_modules", ".bin", "electron");
const env = {
  ...process.env,
  PULSE_LOCAL_API_TOKEN: randomBytes(32).toString("base64url"),
};
const children = [];
let stopping = false;

const prismaCli = path.join(projectRoot, "node_modules", "prisma", "build", "index.js");
const migrateExit = await new Promise((resolve) => {
  const migrate = spawn(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  migrate.once("exit", (code) => resolve(code ?? 1));
});
if (migrateExit !== 0) {
  console.error("No se pudieron aplicar las migraciones de Prisma antes de iniciar PulseStudio.");
  process.exit(migrateExit);
}

function stopChildren(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exitCode = exitCode;
}

const next = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});
children.push(next);

const electron = spawn(electronBin, ["."], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});
children.push(electron);

for (const child of children) {
  child.once("error", (error) => {
    console.error("No se pudo iniciar el entorno de escritorio PulseStudio.", error);
    stopChildren(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      const exitCode = code ?? (signal ? 1 : 0);
      stopChildren(exitCode);
    }
  });
}

process.once("SIGINT", () => stopChildren(0));
process.once("SIGTERM", () => stopChildren(0));
