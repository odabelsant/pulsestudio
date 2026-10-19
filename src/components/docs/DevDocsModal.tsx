"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Code2,
  Copy,
  Database,
  FileText,
  Layers3,
  Lightbulb,
  Moon,
  Network,
  Server,
  Sun,
  Terminal,
  X,
} from "lucide-react";

type TopicId =
  | "overview"
  | "chat"
  | "action-agent"
  | "terminal"
  | "ide"
  | "mcp"
  | "notebooks"
  | "architecture"
  | "dependencies"
  | "api"
  | "database";

interface Topic {
  id: TopicId;
  label: string;
  category: string;
  icon: typeof BookOpen;
}

type Theme = "dark" | "light";
type ReadingSize = "small" | "medium" | "large";

const TOPICS: Topic[] = [
  { id: "overview", label: "Visión general", category: "PulseStudio", icon: BookOpen },
  { id: "chat", label: "Chat y Router", category: "Módulos", icon: Network },
  { id: "action-agent", label: "Action Agent y QA", category: "Módulos", icon: ClipboardCheck },
  { id: "terminal", label: "Terminal y Runner", category: "Módulos", icon: Terminal },
  { id: "ide", label: "IDE integrado", category: "Módulos", icon: Code2 },
  { id: "mcp", label: "Servidores MCP", category: "Módulos", icon: Server },
  { id: "notebooks", label: "Cuadernos y fuentes", category: "Módulos", icon: FileText },
  { id: "architecture", label: "Arquitectura y stack", category: "Desarrollo", icon: Layers3 },
  { id: "dependencies", label: "Dependencias", category: "Desarrollo", icon: Code2 },
  { id: "api", label: "API y ejemplos cURL", category: "Referencia", icon: Network },
  { id: "database", label: "Base de datos", category: "Referencia", icon: Database },
];

function Callout({ title, children, tone = "tip" }: { title: string; children: React.ReactNode; tone?: "tip" | "warning" }) {
  const Icon = tone === "tip" ? Lightbulb : CircleHelp;
  return (
    <aside className={`my-6 rounded-xl border p-4 ${
      tone === "tip"
        ? "border-blue-400/20 bg-blue-500/[0.06]"
        : "border-amber-400/20 bg-amber-500/[0.06]"
    }`}>
      <h3 className={`flex items-center gap-2 text-xs font-semibold ${
        tone === "tip" ? "text-blue-200" : "text-amber-200"
      }`}>
        <Icon className="h-4 w-4" /> {title}
      </h3>
      <div className="mt-2 text-xs leading-6 text-zinc-300">{children}</div>
    </aside>
  );
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(children);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch (error) {
      console.error("DevDocs code copy failed", error);
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2400);
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0c]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{language}</span>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Copiar bloque de código"
        >
          {copyState === "copied" ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
          {copyState === "copied" ? "Copiado" : copyState === "error" ? "Error al copiar" : "Copiar"}
        </button>
      </div>
      <pre className="max-h-[440px] overflow-auto p-4 text-[11px] leading-6 text-emerald-100/90"><code>{children}</code></pre>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
        <thead className="bg-white/[0.04] text-zinc-300">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2.5 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-white/[0.06] text-zinc-400">
              {row.map((cell, index) => <td key={`${row[0]}-${index}`} className="px-3 py-2.5 align-top leading-5">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="mb-8 border-b border-white/[0.08] pb-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-300">{eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">{lead}</p>
    </header>
  );
}

function Article({ topic }: { topic: TopicId }) {
  switch (topic) {
    case "overview":
      return (
        <>
          <SectionHeading eyebrow="PULSESTUDIO · DEVNOTES 01" title="Calidad de software, con el contexto a mano." lead="PulseStudio es un estudio local de IA para desarrollo y QA. Reúne conversación, conocimiento del proyecto y ejecución gobernada en una interfaz de escritorio y web." />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Contexto primero", "La IA recibe fuentes seleccionadas para la tarea, no una carpeta completa sin filtrar."],
              ["QA verificable", "Action Agent convierte historias en casos editables antes de sincronizarlos."],
              ["Ejecución segura", "El Runner ofrece trabajos permitidos; la shell nativa está aislada detrás del bridge Electron."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                <h2 className="text-xs font-semibold text-zinc-100">{title}</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p>
              </div>
            ))}
          </div>
          <h2 className="mt-8 text-lg font-semibold text-white">El ciclo de trabajo</h2>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-zinc-400">
            <li><span className="mr-2 font-mono text-blue-300">01</span> Reúne políticas, arquitectura y ejemplos en un cuaderno.</li>
            <li><span className="mr-2 font-mono text-blue-300">02</span> Pide una tarea al Chat o al Action Agent; el router recupera fuentes pertinentes.</li>
            <li><span className="mr-2 font-mono text-blue-300">03</span> Revisa resultados y diffs. Ejecuta sólo los trabajos aprobados o sincroniza los casos revisados.</li>
          </ol>
          <Callout title="Principio de calidad">
            Un resultado generado es un borrador, no evidencia de ejecución. Conserva la revisión humana y registra la verificación que realmente se ejecutó.
          </Callout>
        </>
      );
    case "chat":
      return (
        <>
          <SectionHeading eyebrow="MÓDULO · ASISTENCIA" title="Chat y Router Inteligente" lead="El Chat envía la petición a /api/chat, que comparte el controlador de generación de /api/ai. El servidor combina reglas de trabajo, rol, historial reciente y contexto recuperado." />
          <h2 className="text-lg font-semibold text-white">De la pregunta a las fuentes</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-xs leading-6 text-zinc-400">
            <li>El usuario selecciona un cuaderno activo y opcionalmente menciona fuentes con <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-emerald-200">@nombre</code>.</li>
            <li><code className="text-zinc-200">recipeRouter</code> reconoce recetas de QA/ISTQB, Azure DevOps, TypeScript y contexto general.</li>
            <li><code className="text-zinc-200">contextRouter</code> puntúa título, etiquetas y fragmentos Markdown; se conservan hasta tres fragmentos pertinentes.</li>
            <li>Las fuentes mencionadas se priorizan explícitamente, se limitan en tamaño y se marcan como datos, no como instrucciones.</li>
          </ol>
          <DataTable headers={["Parte", "Responsabilidad", "Límite"]} rows={[
            ["recipeRouter", "Detecta recetas y reúne fuentes explícitas y recuperadas.", "30.000 caracteres de contexto; hasta 4 fuentes explícitas."],
            ["contextRouter", "Busca términos en metadata y bloques de documentos.", "Hasta 3 documentos, fragmentos de 900 caracteres."],
            ["/api/ai", "Valida proveedor, arma el system prompt y sirve el stream.", "Historial: 12 turnos; 12.000 caracteres por turno."],
          ]} />
          <Callout title="Consejo para mejores respuestas">
            Pon el objetivo y las restricciones en la petición, selecciona el cuaderno correcto y menciona sólo las fuentes normativas necesarias. Esto reduce ruido y consumo de tokens.
          </Callout>
        </>
      );
    case "action-agent":
      return (
        <>
          <SectionHeading eyebrow="MÓDULO · QA" title="Action Agent y pizarra QA" lead="Action Agent parte de una referencia o descripción de historia, elige reglas relevantes del cuaderno activo y solicita al modelo casos estructurados en JSON." />
          <h2 className="text-lg font-semibold text-white">Generar, revisar, sincronizar</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-xs leading-6 text-zinc-400">
            <li>Indica la historia y selecciona categorías como manual, API, positiva o negativa.</li>
            <li>El router busca fuentes QA/BDD/ISTQB y envía las reglas como contexto al agente.</li>
            <li>La pizarra valida título, Gherkin, pasos y resultados esperados. La edición inline se guarda primero como borrador local.</li>
            <li>La sincronización se realiza con el perfil ALM elegido (Azure DevOps o Jira); revisa el destino y la respuesta antes de considerar la tarea terminada.</li>
          </ul>
          <h2 className="mt-7 text-lg font-semibold text-white">Vectores Roadmap en tiempo real</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            El roadmap refleja las etapas observables del flujo actual: recuperación de contexto, generación, validación,
            registro del borrador y, al sincronizar, aprobación, creación individual de cada caso y actualización del historial.
            Los nodos completados aparecen en verde y el paso activo en amarillo. Un nodo rojo se puede abrir para inspeccionar
            el error devuelto por la API o ALM, incluida la información de sincronización parcial cuando aplica.
          </p>
          <CodeBlock language="formato esperado">{`{
  "testCases": [{
    "title": "El usuario inicia sesión",
    "category": "positive",
    "gherkin": "Given una cuenta activa\\nWhen se autentica\\nThen accede al panel",
    "steps": [{
      "step": "Enviar credenciales válidas",
      "expectedResult": "Se muestra el panel de usuario"
    }]
  }]
}`}</CodeBlock>
          <Callout title="Tip de QA" tone="warning">
            Verifica precondiciones, datos de prueba, permisos y resultados observables antes de sincronizar. Un texto Gherkin válido no demuestra que el escenario se haya ejecutado.
          </Callout>
        </>
      );
    case "terminal":
      return (
        <>
          <SectionHeading eyebrow="MÓDULO · EJECUCIÓN" title="Terminal y Runner seguro" lead="El Runner web acepta un conjunto cerrado de trabajos. En escritorio, Electron proporciona una PTY nativa mediante IPC; el renderer usa sólo las operaciones expuestas por preload." />
          <DataTable headers={["Trabajo", "Acción", "Observación"]} rows={[
            ["lint", "npm run lint", "Comprueba estilo y diagnósticos configurados."],
            ["build", "npm run build", "Compila el workspace objetivo."],
            ["typecheck", "npx tsc --noEmit", "Verifica tipos sin emitir archivos."],
            ["playwright", "npx playwright test [ruta]", "La ruta debe ser un archivo spec/test relativo permitido."],
            ["/ask", "Consulta al agente con contexto", "No ejecuta el texto como comando de shell."],
          ]} />
          <CodeBlock language="terminal">{`/help
/context
/run-tests tests/e2e/chat.spec.ts
/ask revisa el criterio de aceptación @reglas-qa.md`}</CodeBlock>
          <Callout title="Frontera de seguridad">
            El modo web rechaza comandos arbitrarios. En Electron, <code>preload.js</code> publica una API acotada con <code>contextBridge</code>; los IPC privilegiados y el almacenamiento ALM cifrado con <code>safeStorage</code> permanecen en el proceso principal.
          </Callout>
        </>
      );
    case "notebooks":
      return (
        <>
          <SectionHeading eyebrow="MÓDULO · CONOCIMIENTO" title="Galería de Cuadernos" lead="Cada cuaderno agrupa fuentes y notas. Las fuentes se persisten como texto extraído en SQLite y se filtran por el cuaderno activo al recuperar contexto." />
          <DataTable headers={["Formato", "Extracción", "Uso"]} rows={[
            [".md", "Texto Markdown", "Secciones y reglas de referencia."],
            [".pdf", "pdf-parse", "Texto indexable; PDF escaneado sin capa de texto requiere OCR externo."],
            [".docx / .word", "Mammoth raw text", "Contenido textual del documento Word."],
            [".html / .htm", "Se eliminan script, style y etiquetas", "Texto legible sin markup de presentación."],
          ]} />
          <p className="text-xs leading-6 text-zinc-400">La importación admite hasta 80 archivos y 8 MB por carga, con un máximo de 1 MB por archivo. Puedes editar notas, renombrar cuadernos, crear una fuente Markdown manualmente o eliminar fuentes individuales.</p>
          <CodeBlock language="mención">{`@reglas-istqb.md
@prompt-azure

Genera los casos negativos para esta historia y sigue las reglas de @reglas-istqb.md.`}</CodeBlock>
          <Callout title="Hack de organización">
            Añade etiquetas descriptivas al guardar fuentes (por ejemplo <code>qa</code>, <code>azure-devops</code> o <code>typescript</code>) y usa nombres cortos reconocibles para menciones rápidas.
          </Callout>
        </>
      );
    case "ide":
      return (
        <>
          <SectionHeading eyebrow="MÓDULO · WORKSPACE" title="IDE integrado" lead="El IDE embebido permite explorar y editar archivos de código/texto del workspace activo y lanzar trabajos predefinidos del Runner sin ejecutar comandos arbitrarios." />
          <h2 className="text-lg font-semibold text-white">Flujo de edición y ejecución</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-7 text-zinc-400">
            <li>Abre el IDE desde el botón superior o desde la navegación lateral. El workspace corresponde al perfil activo configurado para el Runner.</li>
            <li>Selecciona un archivo del explorador, edítalo en el panel y guarda los cambios explícitamente. Si hay cambios sin guardar, se pide confirmación antes de abrir otro archivo.</li>
            <li>El selector de ejecución llama a `/api/runner`; sólo ofrece jobs permitidos como Playwright, typecheck, lint, build y Prisma generate. El Runner ejecuta con `shell: false` dentro del workspace configurado.</li>
          </ol>
          <DataTable headers={["Límite", "Comportamiento"]} rows={[
            ["Archivos visibles", "Código/texto permitido: TS/JS/JSX, CSS/SCSS, HTML, JSON, Markdown, SQL, YAML, TXT y SH."],
            ["Tamaño", "Lectura y escritura limitadas a 1 MB por archivo; el explorador lista hasta 500 archivos."],
            ["Carpetas ignoradas", ".git, .next, node_modules, dist, build, coverage y vendor."],
            ["Rutas", "Relativas al workspace, sin traversal ni enlaces simbólicos; excluye nombres asociados a secretos y sólo modifica archivos existentes."],
          ]} />
          <Callout title="Límite de seguridad" tone="warning">
            Las rutas `/api/workspace` y `/api/runner` son servicios locales de la aplicación. No publiques el servidor sin una capa de autenticación y controles de acceso apropiados.
          </Callout>
        </>
      );
    case "architecture":
      return (
        <>
          <SectionHeading eyebrow="DESARROLLO · SISTEMA" title="Arquitectura y stack" lead="PulseStudio combina un App Router de Next.js con una shell Electron opcional. El servidor Next gestiona API y persistencia; el renderer no accede directamente a la shell ni a secretos." />
          <DataTable headers={["Capa", "Tecnología", "Rol"]} rows={[
            ["UI", "React 19 · Tailwind CSS 4", "Interfaz de Chat, cuadernos, QA y Runner."],
            ["Web/API", "Next.js 16 App Router", "Rutas de servidor, streaming de IA y pantallas."],
            ["Desktop", "Electron", "Ventana, PTY y llamadas IPC controladas."],
            ["Persistencia", "Prisma · SQLite · better-sqlite3", "Modelos y base de datos local dev.db."],
            ["IA", "Vercel AI SDK · Google provider · Ollama HTTP", "Generación por streaming con proveedor configurable."],
          ]} />
          <CodeBlock language="flujo">{`Renderer (React)
  ├─ fetch /api/* ──> Next.js Route Handlers ──> Prisma ──> dev.db
  └─ window.electronAPI ──> preload/contextBridge ──> IPC ──> Electron main`}</CodeBlock>
          <Callout title="Contribución segura">
            Mantén validación en Route Handlers, límites de carga/contexto y checks de confianza en IPC. No pases tokens ALM al renderer ni guardes secretos en localStorage.
          </Callout>
        </>
      );
    case "dependencies":
      return (
        <>
          <SectionHeading eyebrow="DESARROLLO · PAQUETES" title="Dependencias clave" lead="Las librerías se seleccionan para conservar ejecución local, extracción de documentos y una ruta de escritorio con límites de privilegios claros." />
          <DataTable headers={["Paquete", "Por qué está aquí", "Capa"]} rows={[
            ["@prisma/client + prisma", "Cliente tipado, esquema y migraciones SQLite.", "API / datos"],
            ["@prisma/adapter-better-sqlite3 + better-sqlite3", "Adaptador síncrono para la base local embedded.", "API / datos"],
            ["node-pty", "PTY para la terminal nativa de Electron.", "Electron main"],
            ["mammoth", "Extrae texto de archivos Word DOCX.", "Importación"],
            ["pdf-parse", "Extrae texto de PDF con capa textual.", "Importación"],
            ["ai + @ai-sdk/google", "Interfaces de generación y stream del proveedor Gemini.", "IA"],
            ["@modelcontextprotocol/sdk", "Cliente MCP para transportes stdio y SSE.", "Integraciones"],
            ["@ai-sdk/mcp", "Adaptador para exponer herramientas MCP al AI SDK.", "Integraciones"],
            ["@xterm/xterm", "Terminal visual embebida y complementos.", "UI"],
            ["lucide-react + Tailwind CSS", "Iconografía e interfaz utilitaria.", "UI"],
          ]} />
          <Callout title="Mantenimiento">
            Antes de actualizar paquetes mayores, valida `npm audit`, TypeScript, build de producción, carga de PDF/DOCX y empaquetado Electron en las arquitecturas soportadas.
          </Callout>
        </>
      );
    case "mcp":
      return (
        <>
          <SectionHeading eyebrow="INTEGRACIONES · MCP" title="Servidores MCP: sistema nervioso" lead="El panel MCP conecta herramientas externas declaradas por el usuario mediante procesos stdio o endpoints SSE. Los resultados aprobados pueden incorporarse explícitamente al contexto de Chat y Action Agent." />
          <h2 className="text-lg font-semibold text-white">Registrar y probar</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-7 text-zinc-400">
            <li>En Servidores MCP, registra un nombre y el transporte. Para stdio indica ejecutable, argumentos separados por línea y, si es necesario, variables de entorno en JSON. Para SSE indica el endpoint HTTP/HTTPS y encabezados opcionales.</li>
            <li>Usa “Probar y descubrir herramientas” para iniciar una sesión temporal, inicializar MCP y consultar la lista de herramientas. El cliente cierra la sesión al acabar.</li>
            <li>Guarda el servidor para administrarlo. La configuración está en `data/mcp-servers.json`; el archivo se crea con permisos restrictivos, pero el modo web no cifra sus secretos con el almacén del sistema.</li>
            <li>Revisa los argumentos y autoriza cada invocación. Si el resultado es pertinente, usa “Usar como contexto” para compartirlo con Chat y Action Agent.</li>
          </ol>
          <DataTable headers={["Transporte", "Configuración", "Comportamiento"]} rows={[
            ["stdio", "Ejecutable + argumentos + variables de entorno.", "Proceso hijo sin shell; el comando se ejecuta en el host de PulseStudio."],
            ["SSE", "URL HTTP/HTTPS + encabezados opcionales.", "Conexión MCP SSE legada; los redireccionamientos se rechazan."],
            ["Timeouts", "10 s para conexión, 30 s para catálogo/invocación.", "Los fallos se devuelven como errores visibles; la conexión se cierra al terminar."],
            ["Límites", "Hasta 50 servidores y 100 herramientas por servidor según la interfaz.", "Resultados se recortan a 50.000 caracteres."],
          ]} />
          <Callout title="Seguridad operativa" tone="warning">
            Trata servidores, descripciones, esquemas y resultados MCP como entradas no confiables. stdio ejecuta procesos locales y SSE realiza conexiones HTTP; registra sólo servidores que controles. La aprobación en la interfaz reduce ejecuciones accidentales, pero los endpoints locales de la aplicación no sustituyen autenticación si se exponen fuera del equipo.
          </Callout>
          <CodeBlock language="json">{`{
  "name": "Docs locales",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/ruta/permitida"],
  "env": {},
  "enabled": true
}`}</CodeBlock>
        </>
      );
    case "api":
      return (
        <>
          <SectionHeading eyebrow="REFERENCIA · HTTP" title="APIs y ejemplos cURL" lead="Las rutas son locales al servidor Next. Sustituye el puerto si tu entorno no usa 3000; los endpoints de generación responden como texto en streaming." />
          <h2 className="text-base font-semibold text-white">Crear cuaderno y añadir fuente</h2>
          <CodeBlock language="bash">{`curl -sS http://localhost:3000/api/context/notebooks \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"QA · Proyecto"}'

# Importar una o varias fuentes por formulario multipart:
curl -sS http://localhost:3000/api/context/import \\
  -F 'projectName=QA · Proyecto' \\
  -F 'files=@./docs/reglas.md'`}</CodeBlock>
          <h2 className="mt-7 text-base font-semibold text-white">Recuperar contexto y generar respuesta</h2>
          <CodeBlock language="bash">{`curl -sS http://localhost:3000/api/context/router \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"casos de prueba Azure QA","notebookId":"<notebook-id>"}'

curl -N http://localhost:3000/api/chat \\
  -H 'Content-Type: application/json' \\
  -d '{
    "prompt":"Genera casos negativos",
    "provider":"ollama",
    "model":"qwen2.5-coder:3b",
    "notebookId":"<notebook-id>",
    "documentIds":["<source-id>"]
  }'`}</CodeBlock>
          <h2 className="mt-7 text-base font-semibold text-white">Agentes</h2>
          <CodeBlock language="bash">{`curl -sS http://localhost:3000/api/agents

curl -sS http://localhost:3000/api/agents \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"QA Reviewer","description":"Revisión de escenarios","systemPrompt":"Sé concreto y verificable."}'`}</CodeBlock>
          <h2 className="mt-7 text-base font-semibold text-white">Workspace IDE y Runner permitido</h2>
          <CodeBlock language="bash">{`# Listar archivos de código/texto del workspace activo
curl -sS http://localhost:3000/api/workspace

# Leer un archivo permitido
curl -sS 'http://localhost:3000/api/workspace?path=tests/e2e/login.spec.ts'

# Guardar un archivo existente dentro del workspace
curl -sS http://localhost:3000/api/workspace \\
  -H 'Content-Type: application/json' \\
  -d '{"path":"tests/e2e/login.spec.ts","content":"// contenido revisado"}'

# Ejecutar únicamente el test Playwright relativo aprobado por el Runner
curl -sS http://localhost:3000/api/runner \\
  -H 'Content-Type: application/json' \\
  -d '{"job":"playwright","testPath":"tests/e2e/login.spec.ts"}'`}</CodeBlock>
          <h2 className="mt-7 text-base font-semibold text-white">Servidores MCP</h2>
          <CodeBlock language="bash">{`# Listar servidores (sin valores secretos)
curl -sS http://localhost:3000/api/mcp

# Descubrir herramientas de un servidor activo
curl -sS 'http://localhost:3000/api/mcp?tools=<server-id>'

# Cada llamada requiere aprobación explícita en la UI MCP
# Evita enviar secretos o invocar esta ruta desde clientes no confiables.`}</CodeBlock>
          <Callout title="Importante">
            La API no proporciona autenticación por defecto: úsala en un entorno local de confianza, no la publiques directamente en Internet.
          </Callout>
        </>
      );
    case "database":
      return (
        <>
          <SectionHeading eyebrow="REFERENCIA · PERSISTENCIA" title="Prisma y SQLite" lead="La base por defecto se encuentra en dev.db en el directorio de trabajo. Prisma genera el cliente a partir de schema.prisma y sus migraciones." />
          <h2 className="text-base font-semibold text-white">Tablas principales</h2>
          <DataTable headers={["Modelo", "Contenido", "Relación clave"]} rows={[
            ["ContextNotebook", "Título, notas, timestamps.", "Uno a muchos con ContextDocument."],
            ["ContextDocument", "Fuente textual, tags, formato y proyecto.", "notebookId opcional con borrado en cascada."],
            ["ChatSession / ChatMessage", "Conversaciones y mensajes.", "Mensajes en cascada por sesión."],
            ["AgentActionLog", "Acciones y borradores de casos QA.", "Estado de generación/sincronización."],
            ["Agent", "Nombre, descripción y system prompt.", "Artefactos administrables."],
            ["Proposal / RunnerExecution", "Aprobaciones y resultados de jobs.", "Trazabilidad de revisión y ejecución."],
          ]} />
          <CodeBlock language="shell">{`# Regenerar el cliente tras cambios de schema
npx prisma generate

# Aplicar migraciones existentes
npx prisma migrate deploy

# Inspeccionar el fichero SQLite (CLI local)
sqlite3 dev.db '.tables'
sqlite3 dev.db 'PRAGMA table_info(ContextDocument);'
sqlite3 dev.db 'SELECT title, updatedAt FROM ContextNotebook ORDER BY updatedAt DESC;'`}</CodeBlock>
          <Callout title="Operación local">
            Respaldar dev.db antes de cambios de esquema. En CI/deploy, aplica migraciones versionadas; no sustituyas migraciones históricas para acomodar una base ya existente.
          </Callout>
        </>
      );
  }
}

export default function DevDocsModal({
  open,
  onClose,
  theme,
  onThemeToggle,
}: {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeToggle: () => void;
}) {
  const [activeTopic, setActiveTopic] = useState<TopicId>("overview");
  const [readingSize, setReadingSize] = useState<ReadingSize>("medium");
  const topic = TOPICS.find((item) => item.id === activeTopic) ?? TOPICS[0];

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const categories = [...new Set(TOPICS.map((item) => item.category))];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-0 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="devdocs-title"
        data-theme={theme}
        className="devdocs-modal flex h-full w-full max-w-7xl overflow-hidden border border-white/[0.1] bg-[#0d0d0f] shadow-2xl sm:h-[min(92vh,900px)] sm:rounded-2xl"
      >
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/[0.08] bg-[#111113] sm:w-[260px]">
          <div className="border-b border-white/[0.08] p-4">
            <div className="flex items-center gap-2 text-blue-300">
              <Image src="/pulsestudio-logo.png" alt="Logo de PulseStudio" width={24} height={24} className="h-6 w-6 rounded-md object-contain" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">PulseStudio</span>
            </div>
            <h2 id="devdocs-title" className="mt-2 text-lg font-semibold text-white">DevDocs</h2>
            <p className="mt-1 text-[10px] text-zinc-500">Manual interno · Guía técnica</p>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Temas de documentación">
            {categories.map((category) => (
              <div key={category} className="mb-5">
                <h3 className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{category}</h3>
                <div className="space-y-0.5">
                  {TOPICS.filter((item) => item.category === category).map((item) => {
                    const Icon = item.icon;
                    const selected = activeTopic === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTopic(item.id)}
                        aria-current={selected ? "page" : undefined}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] transition ${
                          selected
                            ? "bg-blue-500/15 text-blue-200"
                            : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">{item.label}</span>
                        {selected && <ChevronRight className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-white/[0.08] p-3 text-[9px] leading-4 text-zinc-600">
            Contenido local del proyecto. Revisa código y schema para confirmar cambios recientes.
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.08] bg-[#0d0d0f]/95 px-5 py-3 backdrop-blur sm:px-8">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">{topic.category}</p>
              <p className="truncate text-xs font-medium text-zinc-300">{topic.label}</p>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-2">
              <label className="sr-only" htmlFor="devdocs-reading-size">Tamaño de letra de la documentación</label>
              <select
                id="devdocs-reading-size"
                value={readingSize}
                onChange={(event) => setReadingSize(event.target.value as ReadingSize)}
                className="h-8 rounded-lg border border-white/[0.1] bg-[#171717] px-2 text-[11px] text-zinc-300 outline-none focus:border-blue-500"
                aria-label="Tamaño de letra"
              >
                <option value="small">Pequeño</option>
                <option value="medium">Mediano</option>
                <option value="large">Grande</option>
              </select>
              <button
                type="button"
                onClick={onThemeToggle}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.1] text-zinc-300 transition hover:bg-blue-600 hover:text-white"
                aria-label={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
                aria-pressed={theme === "light"}
                title={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Cerrar documentación"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <article data-reading-size={readingSize} className="devdocs-article mx-auto max-w-4xl px-5 py-8 sm:px-10 sm:py-10">
            <Article topic={activeTopic} />
            <footer className="mt-12 border-t border-white/[0.08] pt-4 text-[10px] text-zinc-600">
              PulseStudio · Documentación interna para desarrollo y QA local.
            </footer>
          </article>
        </main>
      </section>
    </div>
  );
}
