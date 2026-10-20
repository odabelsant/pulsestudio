import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import DevDocsModal from "@/components/docs/DevDocsModal";
import ProductividadPageClient from "@/components/qa/ProductividadPageClient";
import GuiAgentView from "@/components/workspace/GuiAgentView";
import WorkspaceDashboardView from "@/components/workspace/WorkspaceDashboardView";
import WorkspaceSettingsView from "@/components/workspace/WorkspaceSettingsView";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import type { QaEntity } from "@/lib/qa-domain";
import {
  getModulePathSlug,
  qaLegacyPathSlugAliases,
  qaLegacyPathSlugByModule,
  workspaceModules,
  type WorkspaceModuleId,
} from "@/components/workspace/modules";

const moduleRouteIds = [
  "devdocs_dashboard",
  "dashboard",
  "gui",
  "productividad",
  "requirements",
  "test_cases",
  "test_plans",
  "test_suites",
  "bugs",
  "configuracion",
  "devdocs",
] satisfies WorkspaceModuleId[];

const qaEntityByModule: Partial<Record<WorkspaceModuleId, QaEntity>> = {
  requirements: "requirements",
  test_cases: "test-cases",
  test_plans: "test-plans",
  test_suites: "test-suites",
  bugs: "bugs",
};

function getModuleForSlug(slug: string) {
  const aliasModule = qaLegacyPathSlugAliases[slug];
  if (aliasModule) return aliasModule;

  const legacyModule = Object.entries(qaLegacyPathSlugByModule).find(([, pathSlug]) => pathSlug === slug);
  if (legacyModule) return legacyModule[0] as WorkspaceModuleId;

  return moduleRouteIds.find((moduleId) => getModulePathSlug(moduleId) === slug);
}

export function generateStaticParams() {
  const slugs = new Set<string>();
  for (const moduleId of moduleRouteIds) {
    slugs.add(getModulePathSlug(moduleId));
  }
  for (const pathSlug of Object.values(qaLegacyPathSlugByModule)) {
    if (pathSlug) slugs.add(pathSlug);
  }
  for (const pathSlug of Object.keys(qaLegacyPathSlugAliases)) {
    slugs.add(pathSlug);
  }
  return [...slugs].map((slug) => ({ slug }));
}

export default async function PlaceholderModuleRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const moduleId = getModuleForSlug(slug);
  if (!moduleId) notFound();

  if (moduleId === "devdocs_dashboard") redirect("/devdocs");
  if (moduleId === "devdocs") {
    return (
      <WorkspaceShell activeModule="devdocs">
        <DevDocsModal open variant="page" />
      </WorkspaceShell>
    );
  }
  const qaEntity = qaEntityByModule[moduleId];
  if (qaEntity) {
    redirect(`/productividad?entity=${encodeURIComponent(qaEntity)}`);
  }

  if (moduleId === "productividad") {
    return (
      <WorkspaceShell activeModule="productividad">
        <Suspense fallback={<p className="p-6 text-sm text-[#758792]">Cargando módulo de productividad…</p>}>
          <ProductividadPageClient />
        </Suspense>
      </WorkspaceShell>
    );
  }

  if (moduleId === "dashboard") {
    return (
      <WorkspaceShell activeModule="dashboard">
        <WorkspaceDashboardView />
      </WorkspaceShell>
    );
  }

  if (moduleId === "gui") {
    return (
      <WorkspaceShell activeModule="gui">
        <GuiAgentView />
      </WorkspaceShell>
    );
  }

  if (moduleId === "configuracion") {
    return (
      <WorkspaceShell activeModule="configuracion">
        <WorkspaceSettingsView />
      </WorkspaceShell>
    );
  }

  notFound();
}
