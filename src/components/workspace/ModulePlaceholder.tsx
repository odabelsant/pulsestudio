import { Layers3 } from "lucide-react";
import type { WorkspaceModuleId } from "./modules";
import { workspaceModules } from "./modules";

export default function ModulePlaceholder({
  moduleId,
}: {
  moduleId: WorkspaceModuleId;
}) {
  const moduleInfo = workspaceModules[moduleId];

  return (
    <section className="mx-auto w-full max-w-6xl p-5 sm:p-8">
      <header className="mb-8">
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E85D5D]">
          Módulo · En preparación
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#E8F0F3] sm:text-3xl">
          {moduleInfo.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#A6B5BE]">
          {moduleInfo.description}
        </p>
      </header>

      <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-[#30434D] bg-[#10181D]/70 px-6 py-12 text-center">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[#223039] bg-[#141F25] text-[#E85D5D]">
          <Layers3 className="h-5 w-5" />
        </span>
        <h2 className="text-sm font-semibold text-[#E8F0F3]">
          Espacio de trabajo preparado
        </h2>
        <p className="mt-2 max-w-md text-xs leading-5 text-[#758792]">
          La estructura visual de este módulo está lista. Su funcionalidad se
          podrá desarrollar aquí sin afectar las áreas activas de PulseStudio.
        </p>
      </div>
    </section>
  );
}
