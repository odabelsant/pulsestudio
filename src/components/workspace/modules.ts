export type WorkspaceModuleId =
  | "devdocs_dashboard"
  | "dashboard"
  | "chat"
  | "contexto"
  | "skills"
  | "ejecuciones"
  | "ide"
  | "mcp"
  | "aprobaciones"
  | "variables"
  | "terminal"
  | "gui"
  | "alm"
  | "action_agent"
  | "historial"
  | "productividad"
  | "requirements"
  | "test_cases"
  | "test_plans"
  | "test_suites"
  | "bugs"
  | "configuracion"
  | "devdocs";

export const workspaceModules: Record<
  WorkspaceModuleId,
  { title: string; description: string; href: string }
> = {
  devdocs_dashboard: {
    title: "DevDocs Dashboard",
    description: "Accede a la documentación interna y las guías de PulseStudio.",
    href: "/devdocs-dashboard",
  },
  dashboard: {
    title: "Dashboard",
    description: "Vista general del espacio de trabajo y sus actividades.",
    href: "/dashboard",
  },
  chat: {
    title: "Chat",
    description: "Conversa con los proveedores de IA y el contexto del proyecto.",
    href: "/?section=chat",
  },
  contexto: {
    title: "Contexto",
    description: "Organiza cuadernos y fuentes de referencia del proyecto.",
    href: "/?section=context",
  },
  skills: {
    title: "Skills",
    description: "Gestiona las instrucciones activas para los agentes.",
    href: "/?section=skills",
  },
  ejecuciones: {
    title: "Ejecuciones",
    description: "Ejecuta verificaciones permitidas y revisa sus resultados.",
    href: "/?section=runner",
  },
  ide: {
    title: "IDE integrado",
    description: "Explora y edita archivos del workspace activo.",
    href: "/?section=ide",
  },
  mcp: {
    title: "Servidores MCP",
    description: "Administra servidores y herramientas del Model Context Protocol.",
    href: "/?section=mcp",
  },
  aprobaciones: {
    title: "Aprobaciones",
    description: "Revisa propuestas de cambios y pull requests.",
    href: "/?section=proposals",
  },
  variables: {
    title: "Variables de entorno",
    description: "Consulta la configuración y los secretos por entorno.",
    href: "/?section=env",
  },
  terminal: {
    title: "Terminal",
    description: "Usa la terminal gobernada y el agente de acciones.",
    href: "/?section=terminal",
  },
  gui: {
    title: "Agente GUI",
    description: "Accede a la interfaz del agente de acciones en vivo.",
    href: "/gui",
  },
  alm: {
    title: "Conexiones ALM",
    description: "Configura las conexiones de Azure DevOps y Jira.",
    href: "/?section=alm",
  },
  action_agent: {
    title: "Action Agent",
    description: "Genera y revisa casos de prueba con el agente de QA.",
    href: "/?section=agent",
  },
  historial: {
    title: "Historial",
    description: "Consulta conversaciones y ejecuciones anteriores.",
    href: "/?section=history",
  },
  productividad: {
    title: "Productividad QA",
    description: "Requirements, casos, planes, suites y bugs en una sola vista con agente en tiempo real.",
    href: "/productividad",
  },
  requirements: {
    title: "Requirements",
    description: "Centraliza requisitos, criterios de aceptación y trazabilidad.",
    href: "/productividad?entity=requirements",
  },
  test_cases: {
    title: "Test Cases",
    description: "Organiza casos de prueba y sus vínculos con requisitos.",
    href: "/productividad?entity=test-cases",
  },
  test_plans: {
    title: "Test Plans",
    description: "Planifica releases, cobertura y ciclos de validación.",
    href: "/productividad?entity=test-plans",
  },
  test_suites: {
    title: "Test Suites",
    description: "Agrupa casos de prueba para preparar futuras ejecuciones.",
    href: "/productividad?entity=test-suites",
  },
  bugs: {
    title: "Bugs",
    description: "Registra y da seguimiento a defectos del proyecto.",
    href: "/productividad?entity=bugs",
  },
  configuracion: {
    title: "Configuración",
    description: "Preferencias y opciones generales del espacio de trabajo.",
    href: "/configuracion",
  },
  devdocs: {
    title: "DevDocs · Documentación oficial",
    description: "Consulta referencias y documentación técnica del proyecto.",
    href: "/devdocs",
  },
};

export type ExistingWorkspaceSection =
  | "chat"
  | "context"
  | "skills"
  | "runner"
  | "ide"
  | "mcp"
  | "proposals"
  | "env"
  | "terminal"
  | "alm"
  | "agent"
  | "history";

export const existingSectionByModule: Partial<
  Record<WorkspaceModuleId, ExistingWorkspaceSection>
> = {
  chat: "chat",
  contexto: "context",
  skills: "skills",
  ejecuciones: "runner",
  ide: "ide",
  mcp: "mcp",
  aprobaciones: "proposals",
  variables: "env",
  terminal: "terminal",
  alm: "alm",
  action_agent: "agent",
  historial: "history",
};

export function getModuleHref(moduleId: WorkspaceModuleId) {
  return workspaceModules[moduleId].href;
}

/** Path segment for `[slug]` routes (ignores query string on unified QA hrefs). */
export function getModulePathSlug(moduleId: WorkspaceModuleId): string {
  return workspaceModules[moduleId].href.split("?")[0].slice(1);
}

/** Legacy top-level paths that redirect into Productividad (`/productividad?entity=…`). */
export const qaLegacyPathSlugByModule: Partial<Record<WorkspaceModuleId, string>> = {
  requirements: "requirements",
  test_cases: "test-cases",
  test_plans: "test-plans",
  test_suites: "test-suites",
  bugs: "bugs",
};

/** Alternate slugs that still redirect into Productividad (older module paths). */
export const qaLegacyPathSlugAliases: Record<string, WorkspaceModuleId> = {
  test_cases: "test_cases",
  test_plans: "test_plans",
  test_suites: "test_suites",
};
