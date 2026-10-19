import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(appRoot, "..");
const dataDirectory = path.join(appRoot, "data");
const manifestFile = path.join(dataDirectory, "usabilityui-manifest.json");
const outputFile = path.join(workspaceRoot, "usabilityui.md");
const featureFiles = {
  "src/app/page.tsx": "La interfaz principal de Chat y sus accesos rápidos",
  "src/components/attach/AttachContextList.tsx": "La carga de archivos y carpetas como Contexto",
  "src/components/runner/ApprovedRunner.tsx": "Las Ejecuciones y verificaciones seguras",
  "src/components/governance/ChangeProposals.tsx": "Las Aprobaciones de cambios",
  "src/components/environment/EnvironmentVariablesPanel.tsx": "Las Variables de Entorno tipo Vercel",
  "src/components/terminal/ActionAgentTerminal.tsx": "La Terminal interactiva y Agente GUI",
  "src/lib/project-profiles.ts": "Los Perfiles de proyecto",
  "src/lib/change-control.ts": "La persistencia y control de propuestas",
};

async function markdownNames(directory) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.slice(0, -3)).sort();
  } catch { return []; }
}

const apiRoutes = (await fs.readdir(path.join(appRoot, "src", "app", "api"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const current = {
  apiRoutes,
  agents: await markdownNames(path.join(appRoot, "brain", "agents")),
  skills: await markdownNames(path.join(appRoot, "brain", "skills")),
  features: Object.fromEntries(await Promise.all(Object.entries(featureFiles).map(async ([file]) => {
    try { return [file, createHash("sha256").update(await fs.readFile(path.join(appRoot, file))).digest("hex")]; } catch { return [file, "missing"]; }
  }))),
};

let previous = { apiRoutes: [], agents: [], skills: [], features: {}, lastChanges: [] };
try { previous = JSON.parse(readFileSync(manifestFile, "utf8")); } catch { /* First generation establishes the baseline. */ }
const added = (key) => current[key].filter((item) => !previous[key].includes(item));
const removed = (key) => previous[key].filter((item) => !current[key].includes(item));
const changes = [
  ...added("apiRoutes").map((item) => `Nuevo módulo o API disponible: **${item}**.`),
  ...added("agents").map((item) => `Nuevo rol de IA disponible: **${item}**.`),
  ...added("skills").map((item) => `Nueva skill disponible: **${item}**.`),
  ...removed("apiRoutes").map((item) => `Se retiró el módulo o API: **${item}**.`),
  ...removed("agents").map((item) => `Se retiró el rol de IA: **${item}**.`),
  ...removed("skills").map((item) => `Se retiró la skill: **${item}**.`),
  ...Object.entries(current.features).filter(([file, hash]) => previous.features?.[file] !== hash).map(([file]) => `Se actualizó: **${featureFiles[file]}**.`),
];
const latestChanges = changes.length ? changes : (previous.lastChanges ?? []);

const now = new Intl.DateTimeFormat("es-DO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santo_Domingo" }).format(new Date());
const document = `# Guía de uso de PulseStudio

> Guía personal generada automáticamente. Se actualiza al iniciar, validar, compilar o sincronizar el contexto del proyecto. No contiene secretos.

**Última actualización:** ${now}

## La forma más fácil de trabajar

1. En **Contexto**, importa los archivos o la carpeta del proyecto que vas a trabajar.
2. En **Skills**, deja activadas las reglas que quieres que siga la IA.
3. En **Chat**, explica el objetivo con claridad y adjunta el contexto necesario con el botón **+**.
4. En **Ejecuciones**, valida el resultado con lint, build o Playwright.
5. En **Aprobaciones**, revisa y aprueba un diff antes de aplicarlo al proyecto.

## Menú izquierdo

### Chat

Es tu espacio de conversación con la IA. Arriba eliges Ollama local o Gemini y el modelo. Escribe una tarea concreta, por ejemplo: “analiza este error y prepara un diff pequeño”. La conversación conserva el historial reciente.

### Contexto

Aquí guardas y adjuntas archivos que la IA debe conocer. Puedes importar archivos individuales o una carpeta de texto. Úsalo para código, documentación, errores, JSON o SQL. Adjunta sólo lo relevante: una selección pequeña suele ser más rápida y precisa que todo el proyecto.

### Skills

Son reglas que cambian cómo trabaja la IA durante la conversación; no ejecutan código ni modifican archivos.

- **Seguridad local:** evita exponer secretos y operaciones riesgosas.
- **Calidad TypeScript:** pide validación de entradas, tipos y comprobaciones.
- **Cambios revisables:** pide plan, diff y revisión antes de aplicar cambios.

### Ejecuciones

Es el verificador seguro. Sólo permite ejecutar **lint**, **build** y **Playwright** sobre el perfil de proyecto activo. Después de un cambio, ejecútalos para confirmar que no rompiste nada. Si algo falla, usa “Enviar error al Debugger” para devolver el resultado al chat.

### Aprobaciones

Es la última barrera antes de modificar código. El chat prepara un diff; aquí lo revisas, registras la revisión de Arquitecto y Juez, das tu aprobación humana y luego puedes aplicarlo en una rama segura. Nunca escribe directamente en \`main\`.

## Botón + dentro del chat

- **Adjuntar contexto:** abre Contexto para añadir archivos a esta conversación.
- **Configurar skills:** abre el selector de reglas activas.
- **Ejecutar verificación:** abre el Runner seguro.
- **Crear aprobación:** abre el flujo para revisar un diff propuesto.

## Perfiles de proyecto

Un perfil indica sobre qué carpeta trabaja el Runner y dónde se aplicarían propuestas aprobadas. Hoy se administra mediante la API local de proyectos; la próxima mejora será una pantalla visual para hacerlo desde la aplicación.

## Novedades recientes detectadas

${latestChanges.length ? latestChanges.map((change) => `- ${change}`).join("\n") : "- Aún no se detectaron cambios funcionales."}
`;

if (!existsSync(dataDirectory)) mkdirSync(dataDirectory, { recursive: true });
writeFileSync(manifestFile, JSON.stringify({ ...current, lastChanges: latestChanges }, null, 2), "utf8");
writeFileSync(outputFile, `${document}\n`, "utf8");
console.log(`Usability guide updated: ${path.relative(appRoot, outputFile)}`);
