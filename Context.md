# Contexto vivo de PulseStudio

> Este archivo se genera automáticamente. No incluyas secretos aquí; modifica la aplicación y ejecuta `npm run context:update` o cualquiera de los comandos de ciclo de vida configurados.

## Identidad y estado

- **ID local de IA:** `pulsestudio-local`
- **Aplicación principal:** `Orquestador-Fronted` (pulsestudio 0.1.0)
- **Última actualización automática:** 13 de octubre de 2026, 6:44:57 a. m.
- **Raíz de trabajo:** `PulseStudio`
- **Enfoque:** orquestador local, chat con streaming, contexto adjunto y cambios de código gobernados.

## Arquitectura actual

- **Frontend y backend:** Next.js 16 + React 19 + TypeScript.
- **Modelos:** Ollama local por defecto; Gemini opcional mediante `GOOGLE_GENERATIVE_AI_API_KEY`.
- **Datos locales:** Prisma 7 con SQLite (`dev.db`).
- **IA y contexto:** roles y skills versionables en `brain/`; los archivos importados se convierten en documentos de contexto.
- **Ejecución:** runner con lista permitida: lint, build y Playwright; no admite comandos libres.
- **Cambios:** el chat propone un diff; Arquitecto y Juez revisan, una persona aprueba y sólo entonces se aplica en una rama con checkpoint.

## Módulos y rutas

- **Interfaz principal:** `Orquestador-Fronted/src/app/page.tsx`.
- **Contexto nativo:** importación de archivos/carpetas de texto, máximo 80 archivos, 1 MB por archivo y 8 MB por carga.
- **APIs disponibles:** `/api/agents`, `/api/ai`, `/api/brain`, `/api/context`, `/api/fs`, `/api/maintenance`, `/api/projects`, `/api/proposals`, `/api/runner`.
- **Agentes disponibles:** `arquitecto`, `backend`, `debugger`, `frontend`, `juez`, `optimizador`, `qa`.
- **Skills disponibles:** `calidad-typescript`, `cambios-revisables`, `seguridad-local`.

## Configuración requerida

| Variable | Propósito |
| --- | --- |
| `TARGET_WORKSPACE_PATH` | Proyecto objetivo para Runner y propuestas aprobadas. |
| `OLLAMA_BASE_URL` | Dirección de Ollama local. |
| `PULSE_ADMIN_TOKEN` | Protege el flujo de aprobaciones. Nunca se documenta su valor. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Opcional; habilita Gemini. |
| `PULSE_LOCAL_AI_ID` | Opcional; identifica esta instancia local en futuras actualizaciones del contexto. |

## Operación y verificación

```bash
cd Orquestador-Fronted
npm run context:update
npm run lint
npx tsc --noEmit
npm run build
```

## Mejoras y próximas actualizaciones propuestas

1. Migrar las propuestas persistidas en JSON a SQLite con historial y búsqueda cuando aumente el volumen de trabajo.
2. Ampliar Playwright a envío de chat, importación, Runner y el flujo de aprobaciones.
3. Sustituir el ranking de palabras clave por indexación y resúmenes para reducir aún más latencia y tokens.
4. Registrar métricas locales de latencia, tokens y fallos por proveedor, sin almacenar prompts ni secretos.
5. Añadir una interfaz para crear y seleccionar perfiles de proyecto sin usar la API directamente.
6. Añadir cola y cancelación de ejecuciones largas para evitar que el Runner bloquee la interfaz.

---

### 📋 LISTADO DE ACCIONES MANUALES Y CREDENCIALES PENDIENTES

1. **Configurar `PULSE_ADMIN_TOKEN`**: Establecer el token de administración en la variable de entorno `.env` para proteger las API routes de aprobaciones, propuestas y mantenimiento. Este token es obligatorio para que los endpoints `/api/proposals`, `/api/projects` y `/api/runner` funcionen con autorización.

2. **Configurar `GOOGLE_GENERATIVE_AI_API_KEY`**: Si se quiere habilitar el mantenimiento nocturno con Gemini, agregar la clave a las variables de entorno. Sin esta clave, `runNightMaintenance()` lanzará un error indicando que está configurada.

3. **Añadir selects `name` a los componentes de UI**: Los nuevos tests de Playwright fallan porque los botones de la interfaz no tienen los atributos `name` esperados. Se deben añadir los siguientes `name` attributes:
   - En `Runner`: `name="Runner"` en el botón de ejecutar trabajos
   - En `Governance/Propuestas`: `name="Propuestas"` y `name="Cambios gobernados"` 
   - En el chat: `name="Contexto"` para el botón de adjuntar contexto

4. **Migrar datos de proposals.json a SQLite**: Ejecutar `npm run db:push` para aplicar las migraciones y poblar la base de datos SQLite con los datos existentes de `data/proposals.json`. Opcionalmente, se pueden crear scripts de migración para mover historiales de ejecución del Runner.

5. **Crear fixture de prueba para Runner**: Para que los tests de runner funcionen en Playwright, crear el archivo `tests/e2e/fixtures/test.txt` con algún contenido válido, o ajustar los tests para que no requieran un archivo físico.

6. **Verificar configuración de lockfiles**: La advertencia sobre lockfiles múltiples (`package-lock.json` vs el detectado) puede resolverse eliminando uno de ellos o configurando `turboack.root` correctamente en `next.config.ts` si se usa Turbopack.

7. **Revisar `night-maintenance.ts` línea 41**: El parseo de JSON en esa línea tiene un patrón de regex que TypeScript está Flagando. Se recomienda validar y corregir el patrón `replace(/^```json\s*|\s*```$/g, "")` para asegurar la compatibilidad futura.