"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  BookOpen,
  Bug,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Code2,
  FileCheck2,
  FolderKanban,
  GitBranch,
  History,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  PlayCircle,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import {
  getModuleHref,
  type WorkspaceModuleId,
  workspaceModules,
} from "./modules";

type NavigationItem = {
  id: WorkspaceModuleId;
  icon: typeof LayoutDashboard;
  badge?: string;
};

const primaryItems: NavigationItem[] = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "chat", icon: MessageSquare },
  { id: "contexto", icon: BookOpen },
  { id: "skills", icon: Sparkles },
  { id: "ejecuciones", icon: PlayCircle },
  { id: "ide", icon: Code2 },
  { id: "mcp", icon: Server },
  { id: "aprobaciones", icon: ShieldCheck, badge: "control" },
  { id: "variables", icon: KeyRound },
  { id: "terminal", icon: Terminal, badge: "live" },
  { id: "gui", icon: Bot },
  { id: "alm", icon: GitBranch },
  { id: "action_agent", icon: CheckSquare, badge: "QA" },
  { id: "historial", icon: History },
];

const workItems: NavigationItem[] = [
  { id: "requirements", icon: FileCheck2 },
  { id: "test_cases", icon: CheckSquare },
  { id: "test_plans", icon: CalendarDays },
  { id: "test_suites", icon: FolderKanban },
  { id: "bugs", icon: Bug },
];

const configItems: NavigationItem[] = [
  { id: "configuracion", icon: Settings },
];

const allItems = [...primaryItems, ...workItems, ...configItems];

interface WorkspaceShellProps {
  activeModule: WorkspaceModuleId;
  onSelectModule?: (moduleId: WorkspaceModuleId) => void;
  onNewConversation?: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}

export default function WorkspaceShell({
  activeModule,
  onSelectModule,
  onNewConversation,
  headerActions,
  children,
}: WorkspaceShellProps) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allItems;
    return allItems.filter((item) =>
      workspaceModules[item.id].title.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  function selectModule(moduleId: WorkspaceModuleId) {
    setSearchOpen(false);
    setSearchQuery("");
    setMobileMenuOpen(false);
    if (onSelectModule) {
      onSelectModule(moduleId);
      return;
    }
    router.push(getModuleHref(moduleId));
  }

  function renderItems(items: NavigationItem[]) {
    return items.map(({ id, icon: Icon, badge }) => (
      <button
        key={id}
        type="button"
        onClick={() => selectModule(id)}
        title={sidebarCollapsed ? workspaceModules[id].title : undefined}
        aria-current={activeModule === id ? "page" : undefined}
        className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
          activeModule === id
            ? "bg-[#141F25] font-semibold text-[#E85D5D]"
            : "text-[#A6B5BE] hover:bg-[#141F25] hover:text-[#E8F0F3]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon
            className={`h-4 w-4 shrink-0 ${
              activeModule === id
                ? "text-[#E85D5D]"
                : "text-[#758792] group-hover:text-[#E8F0F3]"
            }`}
          />
          {!sidebarCollapsed && (
            <span className="truncate">{workspaceModules[id].title}</span>
          )}
        </span>
        {!sidebarCollapsed && badge && (
          <span className="rounded border border-[#223039] bg-[#10181D] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#A6B5BE]">
            {badge}
          </span>
        )}
      </button>
    ));
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-[#223039] px-4">
        <button
          type="button"
          onClick={() => selectModule("devdocs_dashboard")}
          className="flex min-w-0 items-center gap-2.5 text-left"
          aria-label="Abrir DevDocs de PulseStudio"
        >
          <Image
            src="/pulsestudio-logo.png"
            alt=""
            width={32}
            height={32}
            priority
            className="h-8 w-8 rounded-lg object-contain"
          />
          {!sidebarCollapsed && (
            <span className="truncate text-sm font-semibold tracking-tight text-[#E8F0F3]">
              PulseStudio
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          className="rounded-md p-1 text-[#758792] transition hover:bg-[#141F25] hover:text-[#E8F0F3]"
          aria-label={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
          title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {onNewConversation && (
        <div className="border-b border-[#223039]/60 p-3">
          <button
            type="button"
            onClick={onNewConversation}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              activeModule === "chat"
                ? "bg-[#E85D5D] text-[#080D10] hover:bg-[#F16B75]"
                : "border border-[#223039] bg-[#141F25] text-[#E8F0F3] hover:border-[#E85D5D]/40 hover:bg-[#19262D]"
            }`}
            title="Iniciar nueva conversación con IA"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {!sidebarCollapsed && <span>Nueva conversación</span>}
          </button>
        </div>
      )}

      <nav
        aria-label="Navegación principal"
        className="flex-1 space-y-4 overflow-y-auto p-2"
      >
        <div className="space-y-0.5">{renderItems(primaryItems)}</div>
        <div className="space-y-0.5">
          {!sidebarCollapsed && (
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#758792]">
              Trabajo &amp; Productividad
            </div>
          )}
          {renderItems(workItems)}
        </div>
        <div className="space-y-0.5">
          {!sidebarCollapsed && (
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#758792]">
              Configuración
            </div>
          )}
          {renderItems(configItems)}
        </div>
      </nav>

      <div className="border-t border-[#223039] bg-[#080D10]/40 p-3">
        <button
          type="button"
          onClick={() => selectModule("configuracion")}
          className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-[#141F25]"
          title="Configuración del perfil"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#223039] bg-[#141F25] text-xs font-bold text-[#E85D5D]">
            OS
          </span>
          {!sidebarCollapsed && (
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[#E8F0F3]">
                Odabel
              </span>
              <span className="flex items-center gap-1 font-mono text-[10px] text-[#E85D5D]">
                <span aria-hidden="true">●</span> Local listo
              </span>
            </span>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[#080D10] font-sans text-[#E8F0F3]">
      <aside
        className={`sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-[#223039] bg-[#0A1014] transition-[width] duration-200 md:flex ${
          sidebarCollapsed ? "w-[72px]" : "w-[250px]"
        }`}
      >
        {sidebarContent}
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[#223039] bg-[#0A1014] px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md p-1.5 text-[#758792] hover:bg-[#141F25] hover:text-[#E8F0F3] md:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs text-[#758792]">
              <button
                type="button"
                className="hidden shrink-0 hover:text-[#E8F0F3] sm:inline"
                onClick={() => selectModule("dashboard")}
              >
                Espacio de trabajo
              </button>
              <ChevronRight className="hidden h-3 w-3 shrink-0 sm:block" />
              <span className="truncate font-semibold text-[#E8F0F3]">
                {workspaceModules[activeModule].title}
              </span>
            </div>
          </div>

          <div className="relative hidden min-w-32 max-w-sm flex-1 lg:block">
            <div className="flex items-center rounded-lg border border-[#223039] bg-[#10181D] px-2.5 focus-within:border-[#30434D]">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#E85D5D]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                  if (event.key === "Enter" && filteredItems[0]) {
                    selectModule(filteredItems[0].id);
                  }
                }}
                placeholder="Buscar en PulseStudio..."
                aria-label="Buscar módulos"
                className="h-8 min-w-0 flex-1 bg-transparent px-2 text-xs text-[#E8F0F3] outline-none placeholder:text-[#758792]"
              />
              <kbd className="rounded border border-[#223039] bg-[#141F25] px-1.5 py-0.5 font-mono text-[10px] text-[#A6B5BE]">
                ⌘K
              </kbd>
            </div>
            {searchOpen && searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[#223039] bg-[#10181D] p-1 shadow-2xl">
                {filteredItems.length ? (
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectModule(item.id)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-[#A6B5BE] hover:bg-[#141F25] hover:text-[#E8F0F3]"
                    >
                      {workspaceModules[item.id].title}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-3 text-xs text-[#758792]">
                    No se encontraron módulos.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => selectModule("ide")}
              className={`hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition sm:flex ${
                activeModule === "ide"
                  ? "border-[#E85D5D] bg-[#E85D5D] text-[#080D10]"
                  : "border-[#223039] bg-[#141F25] text-[#E8F0F3] hover:bg-[#19262D]"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Abrir IDE</span>
            </button>
            {headerActions}
          </div>
        </header>
        <main className="flex min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Cerrar menú"
          />
          <aside className="relative flex h-full w-72 flex-col overflow-y-auto border-r border-[#223039] bg-[#0A1014]">
            <div className="flex h-12 items-center justify-end px-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md p-1.5 text-[#758792] hover:text-[#E8F0F3]"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}
    </div>
  );
}
