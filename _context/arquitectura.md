# Arquitectura del Proyecto

## Tech stack

- **Next.js 16.2.9** con App Router y `src/`.
- **TypeScript 5** para tipado estático.
- **Tailwind CSS v4** para estilos utilitarios.
- **Prisma 7.8.0** con SQLite como capa de persistencia.
- **SQLite** local usando `DATABASE_URL="file:./dev.db"`.
- **AI SDK**: `ai` y `@ai-sdk/google` para integración de AI.
- **Shadcn UI**: componentes UI personalizados con Radix y Tailwind.

## Carpetas principales

- `src/app/`: rutas de la aplicación Next.js.
- `src/app/(admin)/`: paneles administrativos para Agents y Context.
- `src/components/`: componentes reutilizables, incluyendo UI y listado de adjuntos.
- `src/components/ui/`: componentes de formulario y layout (`button`, `input`, `textarea`, `dialog`).
- `src/components/attach/`: componente `AttachContextList` para seleccionar documentos contextuales.
- `src/lib/`: utilidades internas, incluyendo `mcp.ts` y `prisma.ts`.
- `src/generated/prisma/`: cliente Prisma generado.
- `prisma/`: esquema Prisma y configuración.
- `_context/`: directorio de memoria viva y documentación de arquitectura.

## Conexión entre módulos

- La UI admin crea/edita `Agent` y `ContextDocument` mediante rutas API:
  - `GET /api/agents`
  - `POST /api/agents`
  - `PUT /api/agents`
  - `DELETE /api/agents`
  - `GET /api/context`
  - `POST /api/context`
  - `PUT /api/context`
  - `DELETE /api/context`
- Los endpoints API usan `src/lib/prisma.ts` para acceder a SQLite con Prisma.
- `src/app/page.tsx` muestra el chat studio con un modal para adjuntar documentos de contexto.
- `src/components/attach/AttachContextList.tsx` carga documentos desde `/api/context` y llama a `onAttach`.
- El `AttachContextList` actualiza el estado de documentos adjuntos en la página principal.
- `src/app/api/ai/route.ts` implementa la ruta de streaming AI usando Google Generative AI y el SDK `ai`.

## Variables de entorno clave

- `DATABASE_URL="file:./dev.db"`
- `AGENTS_WORKSPACE_PATH="/Users/onielsantos/Desktop/Sistema Agentico ia"`
- `PORTFOLIO_WORKSPACE_PATH="/Users/onielsantos/Desktop/Portafolio Odabel"`

## Flujo de datos

1. El usuario ingresa un prompt en `src/app/page.tsx`.
2. Selecciona un agente y un modelo.
3. El usuario abre el modal y adjunta documentos de contexto desde `AttachContextList`.
4. El documento seleccionado se agrega a `attached` en el estado de la página.
5. El envío actualmente muestra una notificación de éxito o error y registra los datos en consola.
6. El estado de `attached` puede usarse luego para construir el prompt RAG.
