import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ProjectProfile = { id: string; name: string; workspace: string; active: boolean };

const dataDirectory = path.join(process.cwd(), "data");
const profilesFile = path.join(dataDirectory, "project-profiles.json");

function ensureDirectory() { if (!existsSync(dataDirectory)) mkdirSync(dataDirectory, { recursive: true }); }

function defaultProfile(): ProjectProfile {
  return { id: "default", name: "Proyecto actual", workspace: process.env.TARGET_WORKSPACE_PATH ?? process.cwd(), active: true };
}

function readProfiles(): ProjectProfile[] {
  try {
    const value = JSON.parse(readFileSync(profilesFile, "utf8"));
    if (Array.isArray(value) && value.every((profile) => typeof profile?.id === "string" && typeof profile?.workspace === "string")) return value;
  } catch { /* First run uses the configured workspace. */ }
  return [defaultProfile()];
}

function saveProfiles(profiles: ProjectProfile[]) {
  ensureDirectory();
  writeFileSync(profilesFile, JSON.stringify(profiles, null, 2), "utf8");
}

export function listProjectProfiles() { return readProfiles(); }

export function activeProjectProfile() {
  const profiles = readProfiles();
  return profiles.find((profile) => profile.active) ?? profiles[0] ?? defaultProfile();
}

export function saveProjectProfile(input: { id?: string; name: string; workspace: string; active?: boolean }) {
  const name = input.name.trim().slice(0, 100);
  const workspace = path.resolve(input.workspace.trim());
  if (!name || !path.isAbsolute(workspace) || !existsSync(workspace)) throw new Error("El workspace debe ser una carpeta local existente.");
  const profiles = readProfiles();
  const id = input.id?.match(/^[a-z0-9-]{1,64}$/i)?.[0] ?? `project-${Date.now()}`;
  const next = { id, name, workspace, active: input.active !== false };
  const index = profiles.findIndex((profile) => profile.id === id);
  if (next.active) profiles.forEach((profile) => { profile.active = false; });
  if (index >= 0) profiles[index] = next; else profiles.push(next);
  saveProfiles(profiles);
  return next;
}
