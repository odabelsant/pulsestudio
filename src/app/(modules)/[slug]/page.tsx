import { notFound } from "next/navigation";
import ModulePlaceholderPage from "@/components/workspace/ModulePlaceholderPage";
import { workspaceModules, type WorkspaceModuleId } from "@/components/workspace/modules";

const placeholderModules = [
  "devdocs_dashboard",
  "dashboard",
  "gui",
  "requirements",
  "test_cases",
  "test_plans",
  "test_suites",
  "bugs",
  "configuracion",
  "devdocs",
] satisfies WorkspaceModuleId[];

function getModuleForSlug(slug: string) {
  return placeholderModules.find(
    (moduleId) => workspaceModules[moduleId].href.slice(1) === slug,
  );
}

export function generateStaticParams() {
  return placeholderModules.map((moduleId) => ({
    slug: workspaceModules[moduleId].href.slice(1),
  }));
}

export default async function PlaceholderModuleRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const moduleId = getModuleForSlug(slug);
  if (!moduleId) notFound();

  return <ModulePlaceholderPage moduleId={moduleId} />;
}
