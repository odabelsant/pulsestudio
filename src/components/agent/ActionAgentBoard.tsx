"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertCircle,
  Check,
  ClipboardCheck,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ActionAgentRoadmap, { type RoadmapStep, type RoadmapStatus } from "@/components/agent/ActionAgentRoadmap";

type GenerationProvider = "ollama" | "google";
type TestCategory = "manual" | "automated" | "performance" | "api" | "sql" | "positive" | "negative";

interface ActionAgentBoardProps {
  provider?: GenerationProvider;
  model?: string;
  notebookId?: string | null;
  mcpContext?: string;
}

interface TestStep {
  id: string;
  step: string;
  expectedResult: string;
}

interface TestCase {
  id: string;
  title: string;
  category: TestCategory;
  gherkin: string;
  steps: TestStep[];
}

interface GeneratedTestCase extends TestCase {
  editDraft: TestCase | null;
}

interface AlmProfile {
  id: string;
  name: string;
  platform: "azure-devops" | "jira";
  baseUrl: string;
  token: string;
  projectKey?: string;
  projectName?: string;
  issueType?: string;
}

const CATEGORY_OPTIONS: { id: TestCategory; label: string }[] = [
  { id: "manual", label: "Manuales" },
  { id: "automated", label: "Automatizadas" },
  { id: "performance", label: "Performance" },
  { id: "api", label: "API" },
  { id: "sql", label: "SQL" },
  { id: "positive", label: "Positivas" },
  { id: "negative", label: "Negativas" },
];

const DEFAULT_CATEGORIES: TestCategory[] = ["manual", "positive", "negative"];

const EMPTY_CASES: GeneratedTestCase[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function profileString(profile: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (typeof profile[key] === "string" && profile[key].trim()) return profile[key].trim();
  }
  return "";
}

function normalizeAlmProfiles(value: unknown): AlmProfile[] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.profiles)
      ? value.profiles
      : [];
  const profiles: AlmProfile[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const credentials = isRecord(entry.credentials) ? entry.credentials : {};
    const platformValue = profileString(entry, ["platform", "provider", "type"]).toLowerCase();
    const platform = platformValue.includes("jira")
      ? "jira"
      : platformValue.includes("azure") || platformValue.includes("devops")
        ? "azure-devops"
        : null;
    const token = profileString(entry, ["token", "accessToken", "personalAccessToken", "pat"]) ||
      profileString(credentials, ["token", "accessToken", "personalAccessToken", "pat"]);
    const baseUrl = profileString(entry, ["baseUrl", "url", "organizationUrl", "instanceUrl"]) ||
      profileString(credentials, ["baseUrl", "url", "organizationUrl", "instanceUrl"]);
    if (!platform || !token || !baseUrl) continue;
    const id = profileString(entry, ["id", "profileId"]) || `${platform}-${profiles.length}`;
    profiles.push({
      id,
      name: profileString(entry, ["name", "displayName", "label"]) || `${platform} ${profiles.length + 1}`,
      platform,
      baseUrl,
      token,
      ...(profileString(entry, ["projectKey", "project"]) ? {
        projectKey: profileString(entry, ["projectKey", "project"]),
      } : {}),
      ...(profileString(entry, ["projectName"]) ? { projectName: profileString(entry, ["projectName"]) } : {}),
      ...(profileString(entry, ["issueType"]) ? { issueType: profileString(entry, ["issueType"]) } : {}),
    });
  }
  return profiles;
}

function decodeGeneratedCases(text: string, selectedCategories: TestCategory[]): GeneratedTestCase[] {
  const unwrapped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(unwrapped);
  if (!isRecord(parsed) || !Array.isArray(parsed.testCases)) {
    throw new Error("El agente no devolvió una lista de casos de prueba válida. Intenta generar de nuevo.");
  }

  const testCases: GeneratedTestCase[] = parsed.testCases.flatMap((value, caseIndex) => {
    if (!isRecord(value) || typeof value.title !== "string" || typeof value.gherkin !== "string") return [];
    const category = CATEGORY_OPTIONS.some((option) => option.id === value.category)
      ? value.category as TestCategory
      : selectedCategories[0] ?? "manual";
    const steps: TestStep[] = Array.isArray(value.steps)
      ? value.steps.flatMap((step, stepIndex) => {
          if (!isRecord(step) || typeof step.step !== "string" || typeof step.expectedResult !== "string") return [];
          return [{
            id: `step-${caseIndex}-${stepIndex}-${crypto.randomUUID()}`,
            step: step.step,
            expectedResult: step.expectedResult,
          }];
        })
      : [];
    if (!steps.length) return [];
    return [{
      id: `case-${caseIndex}-${crypto.randomUUID()}`,
      title: value.title,
      category,
      gherkin: value.gherkin,
      steps,
      editDraft: null,
    }];
  });

  if (!testCases.length) {
    throw new Error("No se generaron casos con título, texto Gherkin y al menos un paso esperado.");
  }
  return testCases;
}

function testCaseToDescription(testCase: TestCase): string {
  return [
    `Categoría: ${CATEGORY_OPTIONS.find((option) => option.id === testCase.category)?.label ?? testCase.category}`,
    "",
    "Gherkin:",
    testCase.gherkin,
    "",
    "Pasos y resultados esperados:",
    ...testCase.steps.flatMap((step, index) => [
      `${index + 1}. ${step.step}`,
      `   Esperado: ${step.expectedResult}`,
    ]),
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validateSecureUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("El perfil ALM debe usar una URL HTTPS sin credenciales embebidas.");
  }
  return url;
}

async function syncAzureCase(profile: AlmProfile, testCase: TestCase): Promise<string> {
  const base = validateSecureUrl(profile.baseUrl);
  const pathParts = base.pathname.split("/").filter(Boolean);
  const project = profile.projectName ?? profile.projectKey ?? pathParts[1];
  if (!project) {
    throw new Error(`El perfil "${profile.name}" debe incluir el nombre o la clave del proyecto Azure DevOps.`);
  }
  base.pathname = `/${encodeURIComponent(pathParts[0])}/${encodeURIComponent(project)}/_apis/wit/workitems/$Test%20Case`;
  base.search = "?api-version=7.1";
  const response = await fetch(base, {
    method: "PATCH",
    headers: {
      Authorization: `Basic ${btoa(`:${profile.token}`)}`,
      "Content-Type": "application/json-patch+json",
      Accept: "application/json",
    },
    body: JSON.stringify([
      { op: "add", path: "/fields/System.Title", value: testCase.title },
      { op: "add", path: "/fields/System.Description", value: escapeHtml(testCaseToDescription(testCase)).replace(/\n/g, "<br>") },
    ]),
  });
  if (!response.ok) {
    throw new Error(`Azure DevOps rechazó "${testCase.title}" (HTTP ${response.status}). Revisa el proyecto y permisos del PAT.`);
  }
  const result: unknown = await response.json();
  const id = isRecord(result) && typeof result.id === "number" ? result.id : null;
  if (id === null) throw new Error("Azure DevOps creó el elemento, pero no devolvió su identificador.");
  return String(id);
}

async function syncJiraCase(profile: AlmProfile, testCase: TestCase): Promise<string> {
  const base = validateSecureUrl(profile.baseUrl);
  let projectKey = profile.projectKey;
  if (!projectKey) {
    const projectResponse = await fetch(new URL("rest/api/3/project/search?maxResults=1", `${base.href.replace(/\/+$/, "")}/`), {
      headers: { Authorization: `Bearer ${profile.token}`, Accept: "application/json" },
    });
    if (!projectResponse.ok) {
      throw new Error(`Jira no pudo consultar el proyecto del perfil "${profile.name}" (HTTP ${projectResponse.status}).`);
    }
    const result: unknown = await projectResponse.json();
    if (isRecord(result) && Array.isArray(result.values) && isRecord(result.values[0])) {
      projectKey = typeof result.values[0].key === "string" ? result.values[0].key : undefined;
    }
  }
  if (!projectKey) {
    throw new Error(`El perfil "${profile.name}" debe incluir la clave de proyecto Jira.`);
  }
  const endpoint = new URL("rest/api/3/issue", `${base.href.replace(/\/+$/, "")}/`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${profile.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: testCase.title,
        issuetype: { name: profile.issueType ?? "Task" },
        description: {
          type: "doc",
          version: 1,
          content: testCaseToDescription(testCase).split("\n").map((line) => ({
            type: "paragraph",
            content: line ? [{ type: "text", text: line }] : [],
          })),
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Jira rechazó "${testCase.title}" (HTTP ${response.status}). Revisa proyecto, tipo de incidencia y permisos del token.`);
  }
  const result: unknown = await response.json();
  const key = isRecord(result) && typeof result.key === "string" ? result.key : null;
  if (!key) throw new Error("Jira creó la incidencia, pero no devolvió su clave.");
  return key;
}

export default function ActionAgentBoard({
  provider = "ollama",
  model = "qwen2.5-coder:3b",
  notebookId = null,
  mcpContext = "",
}: ActionAgentBoardProps) {
  const [storyReference, setStoryReference] = useState("");
  const [storyDescription, setStoryDescription] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<TestCategory[]>(DEFAULT_CATEGORIES);
  const [testCases, setTestCases] = useState<GeneratedTestCase[]>(EMPTY_CASES);
  const [profiles, setProfiles] = useState<AlmProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapStep[]>([]);

  function updateRoadmapStep(id: string, status: RoadmapStatus, detail?: string) {
    setRoadmap((current) => current.map((step) => (
      step.id === id ? { ...step, status, ...(detail ? { detail } : {}) } : step
    )));
  }

  function failActiveRoadmapStep(detail: string) {
    setRoadmap((current) => {
      const activeIndex = current.findIndex((step) => step.status === "in-progress");
      if (activeIndex < 0) return current;
      return current.map((step, index) => (
        index === activeIndex ? { ...step, status: "failed", detail } : step
      ));
    });
  }

  const loadProfiles = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.almGetProfiles) {
      setProfiles([]);
      setLoadingProfiles(false);
      return;
    }
    try {
      const rawProfiles = await api.almGetProfiles();
      const normalized = normalizeAlmProfiles(rawProfiles);
      setProfiles(normalized);
      setSelectedProfileId((current) => (
        normalized.some((profile) => profile.id === current)
          ? current
          : normalized[0]?.id ?? ""
      ));
      if (normalized.length === 0) {
        setError("No hay perfiles ALM utilizables. almGetProfiles() debe devolver plataforma, URL de conexión y token.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los perfiles ALM.");
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadProfiles(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadProfiles]);

  function toggleCategory(event: ChangeEvent<HTMLInputElement>) {
    const category = event.target.value as TestCategory;
    const checked = event.target.checked;
    setSelectedCategories((current) => (
      checked
        ? [...current, category]
        : current.filter((item) => item !== category)
    ));
  }

  async function generateCases() {
    if (!storyReference.trim() && !storyDescription.trim()) {
      setError("Introduce el ID/enlace de la historia o pega su descripción.");
      return;
    }
    if (selectedCategories.length === 0) {
      setError("Selecciona al menos un tipo de prueba.");
      return;
    }
    setGenerating(true);
    setError(null);
    setNotice(null);
    setTestCases([]);
    setRoadmap([
      { id: "generation-context", label: "Consultar contexto y reglas del cuaderno", status: "in-progress" },
      { id: "generation-request", label: "Generar casos de prueba con IA", status: "pending" },
      { id: "generation-validation", label: "Validar y preparar casos para revisión", status: "pending" },
      { id: "generation-audit", label: "Guardar borrador en el historial", status: "pending" },
    ]);
    try {
      const prompt = [
        "Genera casos de prueba concretos a partir de la siguiente historia.",
        `Referencia de historia: ${storyReference || "no especificada"}`,
        `Descripción proporcionada: ${storyDescription || "no proporcionada"}`,
        `Categorías solicitadas: ${selectedCategories.join(", ")}`,
        "Devuelve únicamente JSON válido con este esquema:",
        '{"testCases":[{"title":"...","category":"manual|automated|performance|api|sql|positive|negative","gherkin":"Given...\\nWhen...\\nThen...","steps":[{"step":"...","expectedResult":"..."}]}]}',
        "Incluye pasos verificables, resultados esperados inequívocos y no más de 12 casos. No añadas texto fuera del JSON.",
      ].join("\n");
      const system = [
        "Eres un analista QA. Sigue las reglas pertinentes seleccionadas para esta tarea y no inventes políticas del proyecto.",
      ].join("\n\n");
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          system,
          provider,
          model,
          agentId: "qa",
          skillIds: [],
          ...(notebookId ? { notebookId } : {}),
          ...(mcpContext ? { mcpContext } : {}),
          history: [],
        }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(
          isRecord(body) && typeof body.error === "string"
            ? body.error
            : "No se pudieron generar los casos de prueba.",
        );
      }
      updateRoadmapStep("generation-context", "completed");
      updateRoadmapStep("generation-request", "in-progress");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("La respuesta del agente no incluyó un stream de contenido.");
      const decoder = new TextDecoder();
      let output = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) output += decoder.decode(value, { stream: true });
      }
      output += decoder.decode();
      const generated = decodeGeneratedCases(output, selectedCategories);
      updateRoadmapStep("generation-request", "completed");
      updateRoadmapStep("generation-validation", "in-progress");
      setTestCases(generated);
      updateRoadmapStep("generation-validation", "completed");
      updateRoadmapStep("generation-audit", "in-progress");
      await recordAgentAction({
        actionType: "GENERATED",
        status: "DRAFT",
        cases: generated,
        syncResult: "Casos generados y guardados como borrador.",
      });
      updateRoadmapStep("generation-audit", "completed");
      setNotice(`Se generaron ${generated.length} caso(s) con selección automática de recetas y fuentes relevantes.`);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "No se pudieron generar los casos de prueba.";
      failActiveRoadmapStep(detail);
      setError(detail);
    } finally {
      setGenerating(false);
    }
  }

  function beginEdit(testCaseId: string) {
    setTestCases((current) => current.map((item) => {
      if (item.id !== testCaseId) return item;
      const snapshot: TestCase = {
        id: item.id,
        title: item.title,
        category: item.category,
        gherkin: item.gherkin,
        steps: item.steps,
      };
      return { ...item, editDraft: structuredClone(snapshot) };
    }));
  }

  function updateEdit(testCaseId: string, update: Partial<TestCase>) {
    setTestCases((current) => current.map((item) => (
      item.id === testCaseId && item.editDraft
        ? { ...item, editDraft: { ...item.editDraft, ...update } }
        : item
    )));
  }

  function updateStep(testCaseId: string, stepId: string, update: Partial<TestStep>) {
    setTestCases((current) => current.map((item) => {
      if (item.id !== testCaseId || !item.editDraft) return item;
      return {
        ...item,
        editDraft: {
          ...item.editDraft,
          steps: item.editDraft.steps.map((step) => (
            step.id === stepId ? { ...step, ...update } : step
          )),
        },
      };
    }));
  }

  function saveEdit(testCaseId: string) {
    const editing = testCases.find((item) => item.id === testCaseId)?.editDraft;
    if (
      !editing ||
      !editing.title.trim() ||
      !editing.gherkin.trim() ||
      editing.steps.some((step) => !step.step.trim() || !step.expectedResult.trim())
    ) {
      setError("Completa el título, Gherkin, pasos y resultados esperados antes de guardar.");
      return;
    }
    setTestCases((current) => current.map((item) => (
      item.id === testCaseId && item.editDraft
        ? { ...item.editDraft, editDraft: null }
        : item
    )));
    setNotice("Cambios locales guardados en el borrador de la pizarra.");
    setError(null);
  }

  function cancelEdit(testCaseId: string) {
    setTestCases((current) => current.map((item) => (
      item.id === testCaseId ? { ...item, editDraft: null } : item
    )));
    setError(null);
  }

  function addStep(testCaseId: string) {
    setTestCases((current) => current.map((item) => {
      if (item.id !== testCaseId || !item.editDraft) return item;
      return {
        ...item,
        editDraft: {
          ...item.editDraft,
          steps: [...item.editDraft.steps, {
            id: `step-manual-${crypto.randomUUID()}`,
            step: "",
            expectedResult: "",
          }],
        },
      };
    }));
  }

  async function recordAgentAction(input: {
    actionType: "GENERATED" | "CLEARED" | "APPROVE_SYNC";
    status: "DRAFT" | "APPROVED" | "SYNCED";
    cases: TestCase[];
    syncResult?: string;
  }): Promise<string> {
    const response = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record-agent-action",
        actionType: input.actionType,
        status: input.status,
        storyReference: storyReference.trim() || null,
        testCases: input.cases.map(({ id, title, category, gherkin, steps }) => ({
          id,
          title,
          category,
          gherkin,
          steps,
        })),
        ...(input.syncResult ? { syncResult: input.syncResult } : {}),
      }),
    });
    const result: unknown = await response.json();
    if (
      !response.ok ||
      typeof result !== "object" ||
      result === null ||
      !("log" in result) ||
      typeof result.log !== "object" ||
      result.log === null ||
      !("id" in result.log) ||
      typeof result.log.id !== "string"
    ) {
      const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
        ? result.error
        : "No se pudo registrar la acción del Action Agent.";
      throw new Error(message);
    }
    return result.log.id;
  }

  async function updateAgentAction(
    id: string,
    status: "APPROVED" | "SYNCED",
    syncResult: string,
  ): Promise<void> {
    const response = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-agent-action", id, status, syncResult }),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
        ? result.error
        : "No se pudo actualizar la auditoría del Action Agent.";
      throw new Error(message);
    }
  }

  async function clearBoard() {
    if (testCases.length === 0 || hasEditingItem || clearing || syncing) return;
    setClearing(true);
    setError(null);
    try {
      await recordAgentAction({
        actionType: "CLEARED",
        status: "DRAFT",
        cases: testCases,
        syncResult: "Pizarra limpiada manualmente; los casos se conservaron en el historial.",
      });
      setTestCases([]);
      setNotice("Pizarra limpiada. Los casos quedaron guardados en el historial.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la limpieza de la pizarra.");
    } finally {
      setClearing(false);
    }
  }

  async function approveAndSync() {
    if (testCases.length === 0 || testCases.some((item) => item.editDraft) || syncing || clearing) return;
    const profile = profiles.find((item) => item.id === selectedProfileId);
    if (!profile) {
      setError("Selecciona un perfil ALM válido antes de sincronizar.");
      return;
    }
    setSyncing(true);
    setError(null);
    setNotice(null);
    const created: string[] = [];
    let auditId: string | null = null;
    const syncStepIds = testCases.map((testCase, index) => `sync-case-${index}-${testCase.id}`);
    setRoadmap([
      { id: "sync-approval", label: `Registrar aprobación para ${profile.name}`, status: "in-progress" },
      ...testCases.map((testCase, index) => ({
        id: syncStepIds[index],
        label: `Crear caso ${index + 1}/${testCases.length}: ${testCase.title}`,
        status: "pending" as const,
      })),
      { id: "sync-history", label: "Actualizar historial de sincronización", status: "pending" },
    ]);
    try {
      auditId = await recordAgentAction({
        actionType: "APPROVE_SYNC",
        status: "APPROVED",
        cases: testCases,
        syncResult: `Sincronización aprobada hacia ${profile.name}.`,
      });
      updateRoadmapStep("sync-approval", "completed");
      updateRoadmapStep(syncStepIds[0], "in-progress");
      for (const [index, testCase] of testCases.entries()) {
        const id = profile.platform === "azure-devops"
          ? await syncAzureCase(profile, testCase)
          : await syncJiraCase(profile, testCase);
        created.push(id);
        updateRoadmapStep(syncStepIds[index], "completed", `Elemento creado con identificador ${id}.`);
        if (index + 1 < syncStepIds.length) {
          updateRoadmapStep(syncStepIds[index + 1], "in-progress");
        } else {
          updateRoadmapStep("sync-history", "in-progress");
        }
      }
      const summary = `${created.length} caso(s) sincronizado(s) con ${profile.name}: ${created.join(", ")}.`;
      if (auditId) await updateAgentAction(auditId, "SYNCED", summary);
      updateRoadmapStep("sync-history", "completed", summary);
      setTestCases([]);
      setNotice(`${summary} Los casos se guardaron en el historial.`);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "No se pudo completar la sincronización.";
      if (auditId) {
        try {
          await updateAgentAction(
            auditId,
            "APPROVED",
            created.length
              ? `Sincronización parcial (${created.length}/${testCases.length}). IDs: ${created.join(", ")}. Error: ${detail}`
              : `Sincronización fallida antes de crear elementos. Error: ${detail}`,
          );
        } catch (auditError) {
          const auditDetail = `${detail} Además, no se pudo actualizar la auditoría: ${
            auditError instanceof Error ? auditError.message : "error de historial"
          }`;
          failActiveRoadmapStep(
            auditDetail,
          );
          setError(auditDetail);
          return;
        }
      }
      failActiveRoadmapStep(detail);
      setError(
        created.length
          ? `${detail} Se habían sincronizado ${created.length} caso(s): ${created.join(", ")}.`
          : detail,
      );
    } finally {
      setSyncing(false);
    }
  }

  const hasEditingItem = testCases.some((testCase) => testCase.editDraft !== null);

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-purple-500/10 text-purple-300">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Action Agent · Pizarra QA</h2>
            <p className="mt-1 text-xs text-zinc-500">Consulta el Cerebro, genera casos editables y sincroniza sólo al aprobar.</p>
          </div>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs text-zinc-400">
            Historia de usuario — ID o enlace
            <input
              value={storyReference}
              onChange={(event) => setStoryReference(event.target.value)}
              placeholder="US-123 o https://dev.azure.com/…"
              className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-500/40"
            />
          </label>
          <label className="grid gap-1.5 text-xs text-zinc-400">
            Descripción o criterios de aceptación (opcional)
            <textarea
              value={storyDescription}
              onChange={(event) => setStoryDescription(event.target.value)}
              rows={4}
              placeholder="Pega aquí la historia o sus criterios para que el agente trabaje con el contenido real."
              className="rounded-lg border border-white/[0.1] bg-[#101012] p-3 text-sm leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-500/40"
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-xs text-zinc-400">Tipos de prueba</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CATEGORY_OPTIONS.map((option) => (
                <label key={option.id} className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    value={option.id}
                    checked={selectedCategories.includes(option.id)}
                    onChange={toggleCategory}
                    className="h-3.5 w-3.5 accent-purple-400"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-56 flex-1 gap-1.5 text-xs text-zinc-400 sm:max-w-md">
              Perfil de sincronización
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                disabled={loadingProfiles || profiles.length === 0}
                className="h-10 rounded-lg border border-white/[0.1] bg-[#101012] px-3 text-sm text-zinc-100 outline-none focus:border-purple-500/40 disabled:opacity-50"
              >
                {loadingProfiles && <option value="">Cargando perfiles…</option>}
                {!loadingProfiles && profiles.length === 0 && <option value="">Sin perfiles disponibles</option>}
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name} · {profile.platform}</option>
                ))}
              </select>
            </label>
            <Button type="button" onClick={() => void generateCases()} disabled={generating}>
              {generating ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
              {generating ? "Consultando contexto y generando…" : "Generar casos"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testCases.length === 0 || hasEditingItem || syncing || clearing}
              onClick={() => void approveAndSync()}
            >
              {syncing ? <LoaderCircle className="animate-spin" /> : <Send />}
              Aprobar y Sincronizar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testCases.length === 0 || hasEditingItem || syncing || clearing}
              onClick={() => void clearBoard()}
            >
              {clearing ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
              Limpiar Pizarra
            </Button>
          </div>
          {hasEditingItem && (
            <p className="text-[11px] text-amber-300">Guarda o cancela todas las ediciones antes de aprobar y sincronizar.</p>
          )}
          {!loadingProfiles && profiles.length === 0 && (
            <p className="text-[11px] text-amber-300">
              La pizarra genera y permite editar casos, pero no sincroniza hasta que el bridge IPC proporcione
              <code className="mx-1 rounded bg-black/30 px-1">almGetProfiles()</code> con perfiles utilizables.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        {notice && <p role="status" className="mt-4 text-xs text-emerald-300">{notice}</p>}
      </div>

      <ActionAgentRoadmap steps={roadmap} />

      {generating && (
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#141414] p-4 text-xs text-zinc-400">
          <LoaderCircle className="h-4 w-4 animate-spin text-purple-300" />
          Buscando fragmentos pertinentes en el Cerebro y generando la pizarra…
        </div>
      )}

      {testCases.map((testCase, caseIndex) => {
        const visibleCase = testCase.editDraft ?? testCase;
        const editing = testCase.editDraft !== null;
        return (
          <article key={testCase.id} className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <textarea
                    value={visibleCase.title}
                    onChange={(event) => updateEdit(testCase.id, { title: event.target.value })}
                    aria-label="Título del caso de prueba"
                    rows={2}
                    className="w-full resize-y rounded-lg border border-white/[0.1] bg-[#101012] p-2 text-sm font-semibold text-white outline-none focus:border-purple-500/40"
                  />
                ) : (
                  <h3 className="text-sm font-semibold text-white">{caseIndex + 1}. {testCase.title}</h3>
                )}
                <span className="mt-2 inline-flex rounded-full border border-purple-500/20 bg-purple-500/[0.07] px-2 py-0.5 text-[9px] text-purple-200">
                  {CATEGORY_OPTIONS.find((option) => option.id === visibleCase.category)?.label ?? visibleCase.category}
                </span>
              </div>
              {!editing && (
                <Button type="button" size="sm" variant="outline" onClick={() => beginEdit(testCase.id)}>
                  <Pencil />
                  Editar
                </Button>
              )}
            </div>

            <div className="mt-4">
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Gherkin</h4>
              {editing ? (
                <textarea
                  value={visibleCase.gherkin}
                  onChange={(event) => updateEdit(testCase.id, { gherkin: event.target.value })}
                  aria-label="Texto Gherkin"
                  rows={Math.max(3, visibleCase.gherkin.split("\n").length)}
                  className="w-full resize-y rounded-lg border border-white/[0.1] bg-[#101012] p-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-purple-500/40"
                />
              ) : (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#101012] p-3 font-mono text-xs leading-5 text-zinc-300">
                  {visibleCase.gherkin}
                </pre>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Pasos y resultados esperados</h4>
              {visibleCase.steps.map((step, stepIndex) => (
                <div key={step.id} className="grid gap-2 rounded-lg border border-white/[0.06] bg-[#101012] p-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[10px] text-zinc-500">
                    Paso {stepIndex + 1}
                    {editing ? (
                      <textarea
                        value={step.step}
                        onChange={(event) => updateStep(testCase.id, step.id, { step: event.target.value })}
                        aria-label={`Paso ${stepIndex + 1}`}
                        rows={3}
                        className="rounded-md border border-white/[0.1] bg-black/20 p-2 text-xs leading-5 text-zinc-200 outline-none focus:border-purple-500/40"
                      />
                    ) : (
                      <span className="whitespace-pre-wrap text-xs leading-5 text-zinc-300">{step.step}</span>
                    )}
                  </label>
                  <label className="grid gap-1.5 text-[10px] text-zinc-500">
                    Resultado esperado
                    {editing ? (
                      <textarea
                        value={step.expectedResult}
                        onChange={(event) => updateStep(testCase.id, step.id, { expectedResult: event.target.value })}
                        aria-label={`Resultado esperado del paso ${stepIndex + 1}`}
                        rows={3}
                        className="rounded-md border border-white/[0.1] bg-black/20 p-2 text-xs leading-5 text-zinc-200 outline-none focus:border-purple-500/40"
                      />
                    ) : (
                      <span className="whitespace-pre-wrap text-xs leading-5 text-emerald-200">{step.expectedResult}</span>
                    )}
                  </label>
                </div>
              ))}
            </div>

            {editing && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => addStep(testCase.id)}>
                  <Plus />
                  Añadir paso
                </Button>
                <Button type="button" size="sm" onClick={() => saveEdit(testCase.id)}>
                  <Check />
                  Guardar cambios locales
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => cancelEdit(testCase.id)}>
                  <RotateCcw />
                  Cancelar edición
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
