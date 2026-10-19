"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AttachContextList from "@/components/attach/AttachContextList";
import ApprovedRunner from "@/components/runner/ApprovedRunner";
import ChangeProposals from "@/components/governance/ChangeProposals";
import EnvironmentVariablesPanel from "@/components/environment/EnvironmentVariablesPanel";
import ActionAgentTerminal from "@/components/terminal/ActionAgentTerminal";
import AlmSettingsView from "@/components/alm/AlmSettingsView";
import ContextLibraryView from "@/components/context/ContextLibraryView";
import ActionAgentBoard from "@/components/agent/ActionAgentBoard";
import WorkspaceIDE from "@/components/ide/WorkspaceIDE";
import MCPManagerView from "@/components/mcp/MCPManagerView";
import UnifiedHistoryView, { type HistorySession } from "@/components/history/UnifiedHistoryView";
import ChatInterface, { ContextMentionInput, type ChatMessage, type MentionSource } from "@/components/chat/ChatInterface";
import DevDocsModal from "@/components/docs/DevDocsModal";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  existingSectionByModule,
  getModuleHref,
  type WorkspaceModuleId,
} from "@/components/workspace/modules";
import {
  CheckCircle2,
  BookOpen,
  ChevronDown,
  Code2,
  FileText,
  Key,
  Moon,
  Plus,
  Send,
  Sun,
  Terminal,
  Wrench,
  X,
} from "lucide-react";

type BrainArtifact = { id: string; name: string; description: string };
type ContextDocument = { id: string; projectName: string; moduleName: string; markdownContent: string };
type Section = "chat" | "context" | "skills" | "runner" | "ide" | "mcp" | "proposals" | "env" | "terminal" | "alm" | "agent" | "history";
const moduleBySection: Record<Section, WorkspaceModuleId> = {
  chat: "chat",
  context: "contexto",
  skills: "skills",
  runner: "ejecuciones",
  ide: "ide",
  mcp: "mcp",
  proposals: "aprobaciones",
  env: "variables",
  terminal: "terminal",
  alm: "alm",
  agent: "action_agent",
  history: "historial",
};
type Theme = "dark" | "light";
type Message = ChatMessage;
const THEME_STORAGE_KEY = "pulsestudio-theme";
const themeListeners = new Set<() => void>();

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getThemeSnapshot(): Theme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function saveTheme(theme: Theme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  themeListeners.forEach((listener) => listener());
}

const thinkingMessages = [
  "🧠 Analizando petición...",
  "🔍 Consultando contexto y reglas...",
  "✍️ Redactando respuesta...",
];

const googleModels = [
  { id: "gemini-flash-latest", label: "Gemini Flash" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)" },
];
const ollamaModels = [
  { id: "qwen2.5-coder:3b", label: "Qwen Coder 3B (local recomendado)" },
  { id: "llama3.2:3b", label: "Llama 3.2 3B (local)" },
];
export default function HomeClient({
  initialSection,
}: {
  initialSection: Section;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<"ollama" | "google">("ollama");
  const [agentId, setAgentId] = useState("");
  const [modelId, setModelId] = useState(ollamaModels[0].id);
  const [agents, setAgents] = useState<BrainArtifact[]>([]);
  const [skills, setSkills] = useState<BrainArtifact[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>(["seguridad-local", "calidad-typescript"]);
  const [attached, setAttached] = useState<ContextDocument[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [mentionSources, setMentionSources] = useState<MentionSource[]>([]);
  const [mentionedDocumentIds, setMentionedDocumentIds] = useState<string[]>([]);
  const [mcpContext, setMcpContext] = useState("");
  const [activeSection, setActiveSection] = useState<Section>(initialSection);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [devDocsOpen, setDevDocsOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<"success" | "error">("success");
  const [responseText, setResponseText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposalDraft, setProposalDraft] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const chatSessionIdRef = useRef<string | null>(null);
  const chatSessionPromiseRef = useRef<Promise<string> | null>(null);

  const tokenCount = useMemo(() => Math.max(0, Math.ceil(input.length / 4)), [input]);
  const models = provider === "ollama" ? ollamaModels : googleModels;
  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const selectedModel = models.find((model) => model.id === modelId);
  const thinkingMessage = thinkingMessages[thinkingStep] ?? thinkingMessages[thinkingMessages.length - 1];
  const activeModule = moduleBySection[activeSection];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    if (!isStreaming) return;
    const intervalId = window.setInterval(() => {
      setThinkingStep((step) => Math.min(step + 1, thinkingMessages.length - 1));
    }, 1800);
    return () => window.clearInterval(intervalId);
  }, [isStreaming]);

  function showNotification(message: string, type: "success" | "error" = "success") {
    setNotificationType(type);
    setNotification(message);
  }

  async function ensureChatSession(title: string): Promise<string> {
    if (chatSessionIdRef.current) return chatSessionIdRef.current;
    if (!chatSessionPromiseRef.current) {
      chatSessionPromiseRef.current = fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-session", title: title.slice(0, 160) }),
      }).then(async (response) => {
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== "object" ||
          result === null ||
          !("session" in result) ||
          typeof result.session !== "object" ||
          result.session === null ||
          !("id" in result.session) ||
          typeof result.session.id !== "string"
        ) {
          const message =
            typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
              ? result.error
              : "No se pudo crear la sesión del chat.";
          throw new Error(message);
        }
        return result.session.id;
      });
    }
    const pending = chatSessionPromiseRef.current;
    try {
      const id = await pending;
      chatSessionIdRef.current = id;
      return id;
    } finally {
      if (chatSessionPromiseRef.current === pending) chatSessionPromiseRef.current = null;
    }
  }

  async function persistChatMessage(
    sessionId: string,
    role: Message["role"],
    content: string,
    messageProvider: "google" | "ollama",
  ) {
    const sanitizedSessionId = sessionId.trim();
    const sanitizedContent = content.trim();
    if (!sanitizedSessionId || !sanitizedContent) {
      throw new Error("No se guardó el mensaje: la sesión o el contenido están vacíos.");
    }
    const response = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-message",
        sessionId: sanitizedSessionId,
        role,
        content: sanitizedContent,
        provider: messageProvider,
      }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "No se pudo guardar el mensaje del chat.";
      throw new Error(message);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch("/api/history", { signal: controller.signal, cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo ejecutar la limpieza del historial.");
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          setNotificationType("error");
          setNotification(error instanceof Error ? error.message : "No se pudo limpiar el historial antiguo.");
        });
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    fetch("/api/brain")
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar el cerebro local.");
        return response.json() as Promise<{ agents: BrainArtifact[]; skills: BrainArtifact[] }>;
      })
      .then((catalog) => {
        setAgents(catalog.agents);
        setSkills(catalog.skills);
        setAgentId((current) => current || catalog.agents[0]?.id || "");
        setSkillIds((current) => current.filter((id) => catalog.skills.some((skill) => skill.id === id)));
      })
      .catch(() => showNotification("No se pudo cargar brain/. Revisa los archivos locales.", "error"));
  }, []);

  function changeProvider(nextProvider: "ollama" | "google") {
    setProvider(nextProvider);
    setModelId((nextProvider === "ollama" ? ollamaModels : googleModels)[0].id);
  }

  function toggleSkill(id: string) {
    setSkillIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function diagnoseRunnerOutput(output: string) {
    const debuggerAgent = agents.find((agent) => agent.id === "debugger");
    if (debuggerAgent) setAgentId(debuggerAgent.id);
    setInput(`Analiza este resultado de ejecución. Identifica la causa raíz, el cambio mínimo y la verificación necesaria.\n\n${output.slice(-12_000)}`);
    setActiveSection("chat");
    showNotification("El resultado está listo para que el rol Debugger lo analice.");
  }

  async function sendMessage() {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;
    const documentIds = [...new Set([...attached.map((document) => document.id), ...mentionedDocumentIds])];
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: prompt }]);
    setInput("");
    setMentionedDocumentIds([]);
    setResponseText("");
    setThinkingStep(0);
    setIsStreaming(true);
    setNotification(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: modelId,
          provider,
          agentId,
          skillIds,
          ...(activeNotebookId ? { notebookId: activeNotebookId } : {}),
          documentIds,
          ...(mcpContext ? { mcpContext } : {}),
          history: messages.slice(-12).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "La solicitud de IA falló.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("El stream de respuesta no está disponible.");
      const decoder = new TextDecoder();
      let answer = ""; let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) { answer += decoder.decode(value, { stream: true }); setResponseText(answer); }
      }
      answer += decoder.decode();
        const sanitizedAnswer = answer.trim();
        if (!sanitizedAnswer) {
          console.error("Chat provider returned an empty response", { provider, model: modelId });
          throw new Error("El proveedor terminó sin devolver texto. Inténtalo de nuevo o cambia de modelo.");
        }
        setResponseText(answer);
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: answer }]);
        try {
          const sessionId = await ensureChatSession(prompt);
          await persistChatMessage(sessionId, "user", prompt, provider);
          await persistChatMessage(sessionId, "assistant", sanitizedAnswer, provider);
        } catch (error) {
          console.error("Chat history persistence failed", {
            provider,
            role: "assistant",
            contentLength: sanitizedAnswer.length,
            sessionId: chatSessionIdRef.current,
            error,
          });
          showNotification(
            error instanceof Error ? `Respuesta generada, pero no se guardó: ${error.message}` : "La respuesta no se guardó en el historial.",
            "error",
        );
      }
      setResponseText("");
    } catch (error) {
      showNotification(error instanceof Error ? error.message : "No se pudo recibir la respuesta de IA.", "error");
    } finally { setIsStreaming(false); }
  }

  function openFromAdd(section: Section) { setActiveSection(section); setShowAddMenu(false); }

  function startNewConversation() {
    setMessages([]);
    setResponseText("");
    setInput("");
    setAttached([]);
    setMentionedDocumentIds([]);
    setProposalDraft(null);
    setActiveSection("chat");
    setShowAddMenu(false);
    chatSessionIdRef.current = null;
    chatSessionPromiseRef.current = null;
  }

  function openHistorySession(session: HistorySession) {
    chatSessionIdRef.current = session.id;
    chatSessionPromiseRef.current = null;
    setMessages(session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })));
    setResponseText("");
    setInput("");
    setAttached([]);
    setMentionedDocumentIds([]);
    setActiveSection("chat");
    setNotification(`Conversación cargada: ${session.title}`);
    setNotificationType("success");
  }

  function selectWorkspaceModule(moduleId: WorkspaceModuleId) {
    const section = existingSectionByModule[moduleId];
    if (section) {
      setActiveSection(section);
      return;
    }
    router.push(getModuleHref(moduleId));
  }

  return (
    <div data-theme={theme} className="min-h-screen bg-[#080D10] text-zinc-100">
      <WorkspaceShell
        activeModule={activeModule}
        onSelectModule={selectWorkspaceModule}
        onNewConversation={startNewConversation}
        headerActions={
          <>
            <button
              type="button"
              onClick={() => setDevDocsOpen(true)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[#223039] text-[#A6B5BE] transition hover:bg-[#141F25] hover:text-[#E8F0F3]"
              aria-label="Abrir documentación"
              title="Documentación de PulseStudio"
            >
              <BookOpen className="h-4 w-4" />
            </button>
              <button
                type="button"
                onClick={() => saveTheme(theme === "dark" ? "light" : "dark")}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#223039] text-[#A6B5BE] transition hover:bg-[#141F25] hover:text-[#E8F0F3]"
                aria-label={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
                aria-pressed={theme === "light"}
                title={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <select aria-label="Proveedor de IA" value={provider} onChange={(event) => changeProvider(event.target.value as "ollama" | "google")} className="hidden rounded-md border border-[#223039] bg-[#10181D] px-2 py-1.5 text-xs text-[#A6B5BE] outline-none focus:border-[#30434D] sm:block"><option value="ollama">Ollama local</option><option value="google">Google Gemini</option></select>
              <div className="relative hidden sm:block"><select aria-label="Modelo" value={modelId} onChange={(event) => setModelId(event.target.value)} className="appearance-none rounded-md border border-[#223039] bg-[#10181D] py-1.5 pl-3 pr-8 text-xs text-[#E8F0F3] outline-none focus:border-[#30434D]"><option value={modelId}>{selectedModel?.label || "Seleccionar modelo"}</option>{models.filter((model) => model.id !== modelId).map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-[#758792]" /></div>
          </>
        }
      >
          {activeSection === "chat" && <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 sm:px-8">
            <div className="flex flex-1 flex-col py-10">
              <ChatInterface
                messages={messages}
                responseText={responseText}
                isStreaming={isStreaming}
                thinkingMessage={thinkingMessage}
                onSendDiffToApprovals={(diff) => {
                  setProposalDraft(diff);
                  setActiveSection("proposals");
                }}
              />
            </div>
            <div className="sticky bottom-0 bg-[#0b0b0b] pb-6 pt-3">
              {notification && <div className={`mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${notificationType === "error" ? "border-red-500/25 bg-red-500/10 text-red-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"}`}><span>{notification}</span><button onClick={() => setNotification(null)} aria-label="Cerrar aviso"><X className="h-3.5 w-3.5" /></button></div>}
              {attached.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attached.map((doc) => <span key={doc.id} className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400"><FileText className="h-3 w-3" />{doc.moduleName}<button onClick={() => setAttached((current) => current.filter((item) => item.id !== doc.id))} aria-label={`Quitar ${doc.moduleName}`}><X className="ml-0.5 h-3 w-3 hover:text-white" /></button></span>)}</div>}
              <div className="relative rounded-2xl border border-white/[0.13] bg-[#171717] p-2 shadow-2xl shadow-black/30 focus-within:border-white/[0.25]">
                {showAddMenu && <div className="absolute bottom-[calc(100%+10px)] left-0 w-64 overflow-hidden rounded-xl border border-white/[0.12] bg-[#202020] p-1.5 shadow-2xl"><p className="px-2.5 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Añadir al chat</p><button onClick={() => openFromAdd("context")} className="add-menu-item"><FileText />Adjuntar contexto <span>⌘K</span></button><button onClick={() => openFromAdd("skills")} className="add-menu-item"><Wrench />Configurar skills</button><button onClick={() => openFromAdd("runner")} className="add-menu-item"><Code2 />Ejecutar verificación</button><button onClick={() => openFromAdd("proposals")} className="add-menu-item"><CheckCircle2 />Crear aprobación</button><button onClick={() => openFromAdd("env")} className="add-menu-item"><Key />Variables de entorno</button><button onClick={() => openFromAdd("terminal")} className="add-menu-item"><Terminal />Terminal interactiva</button></div>}
                <ContextMentionInput
                  value={input}
                  sources={mentionSources}
                  onChange={setInput}
                  onMentionIdsChange={setMentionedDocumentIds}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Pregunta, pide un cambio o menciona @fuente…"
                  ariaLabel="Mensaje del chat"
                  className="block w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <div className="flex items-center justify-between px-1"><button onClick={() => setShowAddMenu((shown) => !shown)} className={`grid h-8 w-8 place-items-center rounded-lg transition ${showAddMenu ? "bg-blue-600 text-white hover:bg-blue-700" : "text-zinc-400 hover:bg-blue-700/20 hover:text-white"}`} aria-label="Añadir al chat"><Plus className="h-4 w-4" /></button><div className="flex items-center gap-3"><span className="hidden text-[11px] text-zinc-600 sm:inline">{tokenCount} tokens · {selectedAgent?.name || "Cargando rol"}</span><button disabled={!input.trim() || isStreaming} onClick={sendMessage} className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 hover:text-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500" aria-label="Enviar mensaje"><Send className="h-3.5 w-3.5" /></button></div></div>
              </div>
            </div>
          </section>}

          {activeSection === "context" && <Panel title="Cerebro de Contexto" description="Organiza cuadernos y fuentes para inyección inteligente en Chat y Action Agent."><ContextLibraryView onActiveNotebookChange={setActiveNotebookId} onSourcesChange={setMentionSources} onAttach={(doc) => { setAttached((current) => current.some((item) => item.id === doc.id) ? current : [...current, doc]); setActiveSection("chat"); showNotification(`${doc.moduleName} se añadió al chat.`); }} /><div className="mt-6 border-t border-white/[0.08] pt-6"><h2 className="mb-3 text-sm font-semibold text-white">Adjuntar otros documentos</h2><AttachContextList onAttach={(doc) => { setAttached((current) => current.some((item) => item.id === doc.id) ? current : [...current, doc]); setActiveSection("chat"); showNotification(`${doc.moduleName} se añadió al chat.`); }} onError={(message) => showNotification(message, "error")} /></div></Panel>}
          {activeSection === "skills" && <Panel title="Skills activos" description="Activa únicamente las instrucciones que quieres aplicar a esta conversación."><div className="space-y-2">{skills.map((skill) => <label key={skill.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-[#151515] p-4 transition hover:bg-[#1b1b1b]"><input type="checkbox" checked={skillIds.includes(skill.id)} onChange={() => toggleSkill(skill.id)} className="mt-0.5 h-4 w-4 accent-white" /><span><span className="block text-sm font-medium text-zinc-100">{skill.name}</span><span className="mt-1 block text-sm leading-6 text-zinc-500">{skill.description}</span></span></label>)}</div></Panel>}
          {activeSection === "runner" && <Panel title="Ejecuciones seguras" description="Verifica el proyecto sin abrir otra herramienta."><ApprovedRunner onDiagnose={diagnoseRunnerOutput} /></Panel>}
          {activeSection === "ide" && (
            <section className="flex w-full flex-1 flex-col gap-4 p-4 sm:p-6">
              <div>
                <h1 className="text-xl font-semibold text-white">Workspace IDE</h1>
                <p className="mt-1 text-sm text-zinc-500">Explora, edita y ejecuta trabajos permitidos en el workspace activo.</p>
              </div>
              <WorkspaceIDE />
            </section>
          )}
          {activeSection === "mcp" && (
            <Panel title="Servidores MCP · Sistema Nervioso" description="Registra transportes stdio/SSE, descubre herramientas y aprueba cada ejecución antes de compartir resultados con los agentes.">
              <MCPManagerView onUseToolResult={(context) => {
                setMcpContext(context.slice(0, 20_000));
                showNotification("El resultado MCP quedó disponible como contexto para Chat y Action Agent.");
              }} />
              {mcpContext && (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-xs text-blue-100">
                  <span>Hay un resultado MCP seleccionado como contexto para Chat y Action Agent.</span>
                  <button type="button" onClick={() => setMcpContext("")} className="shrink-0 text-blue-300 hover:text-white">Quitar contexto</button>
                </div>
              )}
            </Panel>
          )}
          {activeSection === "proposals" && <Panel title="Aprobaciones y pull requests" description="Revisa, aprueba y publica cambios desde un único flujo gobernado."><ChangeProposals key={proposalDraft ?? "empty"} initialDiff={proposalDraft ?? ""} /></Panel>}
          {activeSection === "env" && <Panel title="Variables de Entorno y Secretos" description="Gestión centralizada estilo Vercel de credenciales y configuración por entorno (Development, Preview, Production)."><EnvironmentVariablesPanel /></Panel>}
          {activeSection === "terminal" && <Panel title="Terminal & Agente de Acciones en Vivo" description="Consola interactiva gobernada y despacho de tareas asistidas por IA para el proyecto objetivo."><ActionAgentTerminal onDiagnose={diagnoseRunnerOutput} notebookId={activeNotebookId} provider={provider} model={modelId} /></Panel>}
          {activeSection === "alm" && <Panel title="Conexiones ALM" description="Configura conexiones seguras con Azure DevOps y Jira para integrar el ciclo de vida del trabajo."><AlmSettingsView /></Panel>}
          {activeSection === "agent" && <Panel title="Action Agent · Pizarra QA" description="Genera y revisa casos de prueba con las reglas relevantes del Cerebro antes de sincronizar."><ActionAgentBoard provider={provider} model={modelId} notebookId={activeNotebookId} mcpContext={mcpContext} /></Panel>}
          {activeSection === "history" && <Panel title="Historial unificado" description="Consulta conversaciones guardadas y la auditoría de ejecuciones de Action Agent."><UnifiedHistoryView onOpenSession={openHistorySession} /></Panel>}
      </WorkspaceShell>
      <DevDocsModal open={devDocsOpen} onClose={() => setDevDocsOpen(false)} theme={theme} onThemeToggle={() => saveTheme(theme === "dark" ? "light" : "dark")} />
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8"><div className="mb-8"><h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1><p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p></div>{children}</section>;
}
