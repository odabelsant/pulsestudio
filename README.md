This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# PulseStudio

PulseStudio es un orquestador local de IA con Gemini y Ollama, contexto versionable y un Runner seguro para proyectos objetivo.

### Aplicación web: frontend y API

Next.js sirve la interfaz y las rutas API (`/api/ai`, `/api/runner` y `/api/proposals`) en el mismo proceso:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

La navegación global usa el layout de PulseStudio con sidebar y topbar compartidos. Las áreas activas mantienen su estado y componentes existentes; los módulos aún no implementados se muestran como placeholders en `/dashboard`, `/gui`, `/requirements`, `/test-cases`, `/test-plans`, `/test-suites`, `/bugs`, `/configuracion`, `/devdocs-dashboard` y `/devdocs`. El logo de la interfaz es `public/pulsestudio-logo.png`.

### Extensión QAPI para VS Code

`../QAPI-Backend/QAPI` es una extensión de VS Code, no un servidor HTTP adicional. Para usarla, abre esa carpeta en VS Code y pulsa `F5` (**Run Extension**). Sus bundles se regeneran así:

```bash
cd ../QAPI-Backend/QAPI
npm run typecheck
npm run build
```

## Orquestador local

`brain/agents/` contiene roles versionables y `brain/skills/` reglas reutilizables. Studio carga ambos desde `/api/brain` y los aplica del lado servidor al mensaje enviado.

Para usar el modo gratuito, instala e inicia Ollama, descarga `qwen2.5-coder:3b` y elige **Ollama local (gratis)** en Studio. La URL predeterminada es `http://127.0.0.1:11434`; puedes cambiarla con `OLLAMA_BASE_URL` en `.env`.

El Runner seguro sólo permite `npm run lint`, `npm run build` y `npx playwright test`, sin comandos libres. Copia `.env.example` como `.env` y configura `TARGET_WORKSPACE_PATH` con la ruta absoluta de TecnoCosecha. Si no se configura, el runner opera sobre el propio Orquestador para pruebas iniciales.

### Conexiones ALM

La sección **Conexiones ALM** permite configurar Azure DevOps y Jira desde la aplicación Electron. La prueba de conexión verifica acceso de lectura y escritura sobre proyectos o Work Items sin crear ni modificar datos. Para Azure DevOps, el PAT debe permitir consultar proyectos y permisos de Work Items; para Jira, el Bearer Token debe poder consultar la identidad, proyectos y permisos de incidencias.

Los tokens se cifran con Electron `safeStorage` en el directorio de datos de la aplicación y sólo se descifran en el proceso principal. No se guardan en `localStorage` ni en SQLite. En Linux se requiere GNOME Keyring o KWallet; el almacenamiento `basic_text` se rechaza. La configuración ALM no está disponible desde el navegador web.

### Cerebro de Contexto y Action Agent

La sección **Cerebro de Contexto** organiza las fuentes en cuadernos con título editable, notas y carga de Markdown, PDF, Word (.docx/.word) y HTML. Las fuentes y sus tipos se persisten en SQLite; el contenido extraído se limita a 1 MB por archivo. La migración `20261016095000_context_notebooks` agrupa los documentos existentes por proyecto.

El servicio `src/lib/recipeRouter.ts` elige recetas de QA/ISTQB, Azure DevOps, TypeScript y contexto general, y limita los fragmentos enviados al modelo. Chat y Action Agent usan el cuaderno activo; escribe `@` para seleccionar fuentes concretas. En la Terminal, `/ask <tarea> @fuente` envía una consulta al agente con las fuentes seleccionadas, sin ejecutar ese texto como un comando de shell.

El endpoint `POST /api/context/router` devuelve fragmentos y las recetas seleccionadas. Las ediciones de casos de Action Agent quedan en la pizarra hasta que se aprueban.

La sincronización de Action Agent necesita que el bridge Electron disponible exponga `window.electronAPI.almGetProfiles()` con perfiles que incluyan plataforma, URL, token y proyecto para crear los elementos en Azure DevOps o Jira. Los tokens sólo se mantienen en memoria durante la sincronización.
