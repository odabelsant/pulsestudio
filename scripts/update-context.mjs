import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(appRoot, "..");
const outputFile = path.join(workspaceRoot, "Context.md");

async function filesIn(directory, suffix = "") {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
      .map((entry) => entry.name.replace(suffix, ""))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const [packageSource, agents, skills, apiDirectories] = await Promise.all([
  fs.readFile(path.join(appRoot, "package.json"), "utf8"),
  filesIn(path.join(appRoot, "brain", "agents"), ".md"),
  filesIn(path.join(appRoot, "brain", "skills"), ".md"),
  fs.readdir(path.join(appRoot, "src", "app", "api"), { withFileTypes: true }),
]);

const manifest = JSON.parse(packageSource);
const apiRoutes = apiDirectories
  .filter((entry) => entry.isDirectory())
  .map((entry) => `\`/api/${entry.name}\``)
  .sort();
const localAiId = process.env.PULSE_LOCAL_AI_ID?.trim() || "pulsestudio-local";
const now = new Intl.DateTimeFormat("es-DO", { dateStyle: "long", timeStyle: "medium", timeZone: "America/Santo_Domingo" }).format(new Date());

const document = `# Contexto vivo de PulseStudio

> Este archivo se genera automáticamente. No incluyas secretos aquí; modifica la aplicación y ejecuta \`npm run context:update\` o cualquiera de los comandos de ciclo de vida configurados.

## Identidad y estado

- **ID local de IA:** \`${localAiId}\`
- **Aplicación principal:** \`Orquestador-Fronted\` (${manifest.name} ${manifest.version})
- **Última actualización automática:** ${now}
- **Raíz de trabajo:** \`PulseStudio\`
- **Enfoque:** orquestador local, chat con streaming, contexto adjunto y cambios de código gobernados.

## Arquitectura actual

- **Frontend y backend:** Next.js 16 + React 19 + TypeScript.
- **Modelos:** Ollama local por defecto; Gemini opcional mediante \`GOOGLE_GENERATIVE_AI_API_KEY\`.
- **Datos locales:** Prisma 7 con SQLite (\`dev.db\`).
- **IA y contexto:** roles y skills versionables en \`brain/\`; los archivos importados se convierten en documentos de contexto.
- **Ejecución:** runner con lista permitida: lint, build y Playwright; no admite comandos libres.
- **Cambios:** el chat propone un diff; Arquitecto y Juez revisan, una persona aprueba y sólo entonces se aplica en una rama con checkpoint.

## Módulos y rutas

- **Interfaz principal:** \`Orquestador-Fronted/src/app/page.tsx\`.
- **Contexto nativo:** importación de archivos/carpetas de texto, máximo 80 archivos, 1 MB por archivo y 8 MB por carga.
- **APIs disponibles:** ${apiRoutes.join(", ")}.
- **Agentes disponibles:** ${agents.map((id) => `\`${id}\``).join(", ") || "ninguno"}.
- **Skills disponibles:** ${skills.map((id) => `\`${id}\``).join(", ") || "ninguna"}.

## Configuración requerida

| Variable | Propósito |
| --- | --- |
| \`TARGET_WORKSPACE_PATH\` | Proyecto objetivo para Runner y propuestas aprobadas. |
| \`OLLAMA_BASE_URL\` | Dirección de Ollama local. |
| \`PULSE_ADMIN_TOKEN\` | Protege el flujo de aprobaciones. Nunca se documenta su valor. |
| \`GOOGLE_GENERATIVE_AI_API_KEY\` | Opcional; habilita Gemini. |
| \`PULSE_LOCAL_AI_ID\` | Opcional; identifica esta instancia local en futuras actualizaciones del contexto. |

## Operación y verificación

\`\`\`bash
cd Orquestador-Fronted
npm run context:update
npm run lint
npx tsc --noEmit
npm run build
\`\`\`

## Mejoras y próximas actualizaciones propuestas

1. Migrar las propuestas persistidas en JSON a SQLite con historial y búsqueda cuando aumente el volumen de trabajo.
2. Ampliar Playwright a envío de chat, importación, Runner y el flujo de aprobaciones.
3. Sustituir el ranking de palabras clave por indexación y resúmenes para reducir aún más latencia y tokens.
4. Registrar métricas locales de latencia, tokens y fallos por proveedor, sin almacenar prompts ni secretos.
5. Añadir una interfaz para crear y seleccionar perfiles de proyecto sin usar la API directamente.
6. Añadir cola y cancelación de ejecuciones largas para evitar que el Runner bloquee la interfaz.
`;

await fs.writeFile(outputFile, `${document}\n`, "utf8");
console.log(`Context updated: ${path.relative(appRoot, outputFile)}`);
