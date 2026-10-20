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

La navegación global usa el layout de PulseStudio con sidebar y topbar compartidos. Los módulos `Requirements`, `Test Cases`, `Test Plans`, `Test Suites` y `Bugs` usan persistencia CRUD local en `/api/qa/*`. `Dashboard`, `Agente GUI` y `Configuración` consumen datos locales (`/api/dashboard`, terminal gobernada y preferencias). Antes de usar QA en una base existente, ejecuta `npx prisma migrate deploy`. DevDocs se consulta en `/devdocs`; `/devdocs-dashboard` redirige a esa ruta. El logo de la interfaz es `public/pulsestudio-logo.png`.

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

El Runner gobernado sólo permite `lint`, `build`, `playwright`, `typecheck` y `prisma generate`; no recibe comandos libres. Cada ejecución requiere confirmación explícita, una autorización temporal de un solo uso vinculada al trabajo y al workspace, y registra su resultado. Los fallos y resultados desconocidos no se presentan como éxitos. `lint` y `build` ejecutan scripts que llaman a `context:update`; considera ese efecto antes de autorizarlos. La terminal interactiva de Electron es una función de shell separada y no forma parte de la allowlist del Runner. Copia `.env.example` como `.env` y configura `TARGET_WORKSPACE_PATH` con la ruta absoluta de TecnoCosecha. Si no se configura, el runner opera sobre el propio Orquestador para pruebas iniciales.

### Conexiones ALM

La sección **Conexiones ALM** permite configurar Azure DevOps y Jira desde la aplicación Electron. La prueba de conexión verifica acceso de lectura y escritura sobre proyectos o Work Items sin crear ni modificar datos. Para Azure DevOps, el PAT debe permitir consultar proyectos y permisos de Work Items; para Jira, el Bearer Token debe poder consultar la identidad, proyectos y permisos de incidencias.

Los tokens se cifran con Electron `safeStorage` en el directorio de datos de la aplicación y sólo se descifran en el proceso principal. No se guardan en `localStorage` ni en SQLite. En Linux se requiere GNOME Keyring o KWallet; el almacenamiento `basic_text` se rechaza. La configuración ALM no está disponible desde el navegador web. La comprobación de permisos no crea ni modifica datos; las escrituras ALM permanecen deshabilitadas. Las herramientas MCP pueden producir efectos externos: mientras las escrituras de proveedores sigan fuera de alcance, invoca sólo herramientas que hayas verificado como de lectura.

### Cerebro de Contexto y Action Agent

La sección **Cerebro de Contexto** organiza las fuentes en cuadernos con título editable, notas y carga de Markdown, PDF, Word (.docx/.word) y HTML. Las fuentes y sus tipos se persisten en SQLite; el contenido extraído se limita a 1 MB por archivo. La migración `20261016095000_context_notebooks` agrupa los documentos existentes por proyecto.

El servicio `src/lib/recipeRouter.ts` elige recetas de QA/ISTQB, Azure DevOps, TypeScript y contexto general, y limita los fragmentos enviados al modelo. Chat y Action Agent usan el cuaderno activo; escribe `@` para seleccionar fuentes concretas. En la Terminal, `/ask <tarea> @fuente` envía una consulta al agente con las fuentes seleccionadas, sin ejecutar ese texto como un comando de shell.

El endpoint `POST /api/context/router` devuelve fragmentos y las recetas seleccionadas. Los casos de Action Agent se conservan como borradores locales en la pizarra y el historial. La aprobación y la ejecución de cambios siguen deshabilitadas.

Action Agent permite asociar hasta cuatro archivos `.md`/`.mdx` del cuaderno activo como **procedimiento** o **datos de trabajo**. El servidor valida que sigan en ese cuaderno y registra referencias con huellas SHA-256 junto con los borradores y sus resultados locales. El contenido Markdown es contexto no confiable: nunca concede permisos ni autorización.

La propuesta local y la generación de casos se distinguen de una operación externa. Los cinco módulos QA guardan datos locales y sus relaciones en SQLite; los requisitos pueden contener referencias externas, pero no se sincronizan. Action Agent conserva sus borradores y sólo importa casos a Test Cases tras una autorización local de un solo uso ligada al contenido, a su origen y a las huellas SHA-256 del Contexto de Acción. El historial no acepta del cliente transiciones `APPROVED`/`SYNCED`; la importación QA autorizada actualiza el borrador de origen dentro de su transacción. Las escrituras en Jira y Azure DevOps siguen deshabilitadas.

Las rutas API locales requieren una sesión; las operaciones administrativas (por ejemplo, variables secretas y propuestas) también requieren `PULSE_ADMIN_TOKEN`. En desarrollo sin token sólo se aceptan solicitudes same-origin de loopback; fuera de desarrollo no existe esa excepción. `npm run desktop:dev` genera un token efímero compartido entre Next.js y Electron. El proceso principal de Electron añade ese token a las solicitudes locales; preload no lo expone al renderer. `PULSE_ADMIN_TOKEN` tampoco se entrega al renderer. Las aprobaciones MCP y del Runner se vinculan en servidor al hash del contenido, destino y operación, y se consumen una sola vez. Las propuestas de cambios persisten hashes de revisión/aprobación, pero aplicar diffs, revertirlos y publicar no está implementado y se rechaza explícitamente.

Las migraciones `20261019193000_action_authorizations_and_runner_audit` y `20261019194500_qa_domain` añaden aprobaciones/auditoría del Runner y las entidades QA. Son aditivas. Antes de usar las tablas nuevas en una base existente, respáldala y aplica las migraciones con `npx prisma migrate deploy`; no se aplicaron al `dev.db` local de este worktree. El script `dev` no ejecuta `context:update`; Next.js aún puede actualizar su bloque administrado en `AGENTS.md` al iniciar. `build`, `lint` y `db:push` sí ejecutan `context:update`. Los despliegues web no locales requieren diseñar y configurar autenticación de usuario antes de habilitar estas APIs.
