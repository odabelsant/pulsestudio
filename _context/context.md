# Contexto del Proyecto

## Estado actual

Este proyecto es un asistente local basado en IA llamado **Asistente IA**.

Ya se ha construido:

- Un dashboard principal en `src/app/page.tsx` con selección de agente, modelo, conteo de tokens y modal de adjuntos.
- Un sistema de administración para `Agents` y `ContextDocument` en `src/app/(admin)/agents/page.tsx` y `src/app/(admin)/context/page.tsx`.
- APIs CRUD reales usando Prisma y SQLite en `src/app/api/agents/route.ts` y `src/app/api/context/route.ts`.
- Un cliente Prisma central en `src/lib/prisma.ts` usando `@prisma/adapter-better-sqlite3`.
- Componentes de UI reutilizables de estilo Shadcn en `src/components/ui/`.
- Un componente `AttachContextList` que carga documentos de contexto desde la API.
- Feedback visual para errores y éxitos en la UI principal del chat.

## Bugs resueltos

- Se eliminó el almacenamiento temporal en JSON para `agents` y `context` y se reemplazó con persistencia real en SQLite.
- Se corrigió la importación y configuración del cliente Prisma con el adaptador SQLite.
- Se agregaron mensajes de notificación para captura de errores de formulario y documentos duplicados en el modal.
- Se arregló un error de encabezado accidental en `src/app/page.tsx`.

## Próximos pasos inmediatos

1. Implementar la ruta API de AI streaming completa para enviar prompts y recibir respuestas. ✅ (Hecho)
2. Conectar realmente la lógica de `attached` en `src/app/page.tsx` con el prompt que se envía a la API AI. ✅ (Hecho)
3. Añadir validación más robusta en los formularios admin y confirmaciones modales.
4. Construir el sistema de memoria viva (`Living Context Memory`) que capture nueva información de usuario y refuerce el contexto adjunto.

## Cambios recientes

- `src/app/api/ai/route.ts`: se implementó un endpoint que usa `@ai-sdk/google` y `ai` para enviar prompts con `system` mensajes y devolver un stream de texto.
- `src/app/page.tsx`: se conectó el botón Send al endpoint `/api/ai`, se añadió streaming de respuesta y se incluyeron documentos adjuntos y el prompt del agente como `system`.
- `src/app/page.tsx`: se agregó un panel de respuesta AI con estado de streaming y notificaciones de éxito/error.

## Dependencias y configuraciones

- Se utiliza la variable de entorno `GOOGLE_GENERATIVE_AI_API_KEY` en `.env` para la autenticación de Google Generative AI.
- El flujo usa el proveedor de Google a través de `createGoogleGenerativeAI` y `streamText` de `ai`.

## Estado actualizado

El chat ahora envía prompts reales al backend, incluye el `systemPrompt` del agente y concatena documentos adjuntos como contexto. La respuesta AI se recibe como stream y se muestra en el dashboard.
