import ModulePlaceholder from "./ModulePlaceholder";
import WorkspaceShell from "./WorkspaceShell";
import type { WorkspaceModuleId } from "./modules";

export default function ModulePlaceholderPage({
  moduleId,
}: {
  moduleId: WorkspaceModuleId;
}) {
  return (
    <WorkspaceShell activeModule={moduleId}>
      <ModulePlaceholder moduleId={moduleId} />
    </WorkspaceShell>
  );
}
