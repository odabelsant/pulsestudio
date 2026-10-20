# PulseStudio — Plan de evolución y auditoría de integración

**Revisado:** 2026-10-19  
**Base Git:** `main` / `origin/main`, commit `1fbd4ab096c0b728fb6318500a14834bac490027`.  
**Alcance de esta revisión:** estado del worktree actual, incluidas modificaciones locales pendientes de las Fases 1 y 2. No se revirtieron ni sobrescribieron. `AGENTS.md` y `dev.db` ya estaban modificados antes de esta auditoría; HEAD conserva el punto de recuperación confirmado, pero esos cambios locales no están incluidos en ese commit.

## 1. Resumen ejecutivo

- La aplicación contiene un núcleo real de chat/contexto, persistencia local, Runner, administración MCP, conexiones ALM de escritorio y generación QA mediante Action Agent. No todos estos flujos tienen pruebas de extremo a extremo.
- Dashboard, Agente GUI y los cinco espacios de QA Management se muestran explícitamente como placeholders; sus descripciones de navegación no prueban funcionalidad.
- DevDocs no fue eliminado: hay contenido en un modal integrado al workspace. Las rutas `/devdocs-dashboard` y `/devdocs`, en cambio, terminan en placeholders y no llevan a ese contenido.
- Contexto y Action Agent permiten asociar Markdown de procedimiento/datos, validar referencias y registrar huellas. La generación y la auditoría local no constituyen aprobación ni ejecución externa.
- `AgentActionLog` conserva borradores como JSON; no existen modelos de dominio para Requirements, Test Plans, Test Suites ni Bugs. El Runner ahora registra ejecuciones y autorizaciones, pero el `dev.db` local no se migró y el flujo completo de API no se probó contra una base de trabajo.
- Los métodos API sensibles encontrados requieren autenticación local o administrativa; `/api/chat` delega en la ruta IA protegida y el `GET` del webhook sólo publica un estado estático. Las operaciones administrativas sensibles requieren además `PULSE_ADMIN_TOKEN`. Electron mantiene el token de sesión en el proceso principal y lo inyecta en las solicitudes locales, no en preload.
- La interfaz ALM cifra credenciales con Electron `safeStorage` y prueba permisos sin modificar datos, pero Action Agent sólo recibe metadatos. No existe todavía un conector tipado de lectura/escritura para acciones.
- No se habilitaron ni probaron escrituras reales en Jira o Azure DevOps.

## 2. Matriz de módulos y estado real

Estados usados: **Diseñada** = UI sin integración demostrada; **Parcial** = existe una parte del flujo; **Integrada** = UI y backend/persistencia están conectados; **Verificada** = además hay pruebas del flujo esperado; **Bloqueada** = un riesgo o dependencia impide avanzar; **No localizada** = no se encontró evidencia suficiente. Un módulo puede tener capacidades en estados distintos.

| Módulo/capacidad | Estado | Evidencia actual | Bloqueo o límite |
|---|---|---|---|
| Dashboard | Diseñada | `/dashboard` está en `WorkspaceShell` y `modules.ts`; `[slug]/page.tsx` la entrega a `ModulePlaceholderPage`, que muestra “En preparación”. | No hay panel conectado a métricas reales. Debe consumir datos de los módulos que se verifiquen, no inventar actividad. |
| Agente GUI | Diseñada | `/gui` está en navegación y en la lista de placeholders. Action Agent tiene una interfaz activa diferente. | No se localizó un flujo de agente GUI conectado a herramientas/backend; no confundirlo con Action Agent. |
| Requirements | Diseñada | `/requirements` usa la vista placeholder. | No se encontraron API, CRUD ni modelo Prisma de requisitos. |
| Test Cases | Diseñada como espacio de trabajo | `/test-cases` es placeholder. Action Agent sí genera y audita borradores mediante historial. | El historial no es un CRUD de casos: `AgentActionLog.testCases` es JSON y no hay vínculo persistente a requisitos. |
| Test Plans | Diseñada | `/test-plans` es placeholder. | Sin modelo, API ni operaciones de planes/ciclos detectadas. |
| Test Suites | Diseñada | `/test-suites` es placeholder. | Sin modelo, API ni agrupación/ejecución de suites detectadas. |
| Bugs | Diseñada; herramienta auxiliar parcial | `/bugs` es placeholder. `bug-reporter.ts` prepara un formato, pero `getExecutionHistory()` en `runner.ts` devuelve `[]`; no se encontró publicación funcional. | Requiere historial real de ejecución y modelo local de defectos antes de enlazar un proveedor. |
| Configuración general | Diseñada | `/configuracion` resuelve a placeholder. | No integra aún una pantalla general de preferencias/configuración. |
| Variables de entorno | Parcial; control de acceso cerrado | `EnvironmentVariablesPanel` y `/api/env` leen, revelan y modifican valores en Prisma; la API exige sesión local y token administrativo, y el token no se persiste en `localStorage`. | Las pruebas de helper validan credenciales ausentes/incorrectas; falta probar las rutas HTTP con credenciales y una DB aislada. |
| DevDocs | Parcial; navegación desconectada | `DevDocsModal` está importado y renderizado en `HomeClient`. El logo navega a `/devdocs-dashboard` y el mapa incluye `/devdocs`; ambas rutas son placeholders. | El módulo no está eliminado ni completamente oculto. La evidencia revisada no permite determinar si históricamente fue renombrado/movido; no recrearlo: recuperar la navegación reutilizando el modal existente. |
| Action Agent y contexto de acción | Parcial; validaciones unitarias verificadas | `ActionAgentBoard` genera, edita en la pizarra y registra borradores/errores/cancelaciones por `/api/history`. `action-context.ts` valida Markdown, máximo de fuentes y SHA-256; `recipeRouter.ts` compara la huella y trata documentos como datos no confiables. | Propuesta/ejecución/aprobación no tienen un ciclo persistido común. No hay autorización externa ni invalidación de aprobación porque no existe aprobación ligada a contenido. Las pruebas actuales no verifican el flujo completo con IA/DB. |
| Runner | Parcial; autorización y registro implementados, flujo real pendiente de verificación | `/api/runner` sólo admite acciones `authorize`/`execute`; `runApprovedJob` consume una aprobación de un solo uso ligada a job, comando y workspace, usa `spawn` sin shell, limita duración/salida y persiste estados reales en `RunnerExecution`. El historial muestra estado, salida de proceso, error, aprobación y huella. | No se ejecutó un job real para evitar side effects del workspace. `lint`/`build` activan scripts con `context:update`; requieren revisión humana del efecto antes de autorizarlos. La nueva migración no se aplicó a `dev.db`. La terminal interactiva Electron es una capacidad separada y sigue siendo un shell local operado por el usuario. |
| Aprobaciones y propuestas | Parcial; aplicación/publicación bloqueadas explícitamente | `Proposal` persiste revisiones con hash de contenido; aprobación humana almacena hash y fecha, y el servicio invalida aprobación si revisiones o contenido no coinciden. `/api/proposals` exige sesión y token administrativo. | `apply`, `rollback` y `publish` devuelven error explícito porque no ejecutan diffs/Git ni publicación real. Las propuestas se almacenan en SQLite, pero la migración aditiva aún no se aplicó a `dev.db`. |
| Historial | Integrada para chat, borradores, Runner y aprobaciones; validaciones unitarias | `/api/history` lista `ChatSession`, `AgentActionLog`, `RunnerExecution`, huellas/aprobaciones vinculadas y propuestas; la limpieza local elimina auditoría de más de 15 días. | La prueba de persistencia funcional de API/UI en la DB de trabajo sigue pendiente. Migrar antes de usar el nuevo historial en una base existente. |
| Contexto | Integrada para biblioteca local; validaciones de acción verificadas | `ContextLibraryView` y `/api/context*` usan Prisma/SQLite, notebooks, importación y selección; Action Agent verifica que las fuentes sigan en el cuaderno. | La integración funcional completa debe incluir casos de documento ausente/cambiado y prueba API aislada. |
| Conexiones ALM | Parcial; secretos protegidos en Electron | `electron/main.js` cifra/descifra con `safeStorage`; `alm:load-connections`, `alm:test-connection` y `alm:list-action-connections` validan el remitente. Se consulta lectura/permisos, no se crean datos. | Action Agent sólo recibe proveedor, alias y estado. Falta una operación explícita, tipada y autorizada de lectura para cada proveedor; no hay escritura habilitada. |
| Servidores MCP | Parcial; autorización y registro implementados | `MCPManagerView` solicita confirmación, `/api/mcp` emite una autorización temporal ligada a herramienta, esquema, configuración, destino y argumentos; la invocación la consume una vez. Los resultados se redactan y el historial registra hash/estado sin guardar secretos. | No se invocaron herramientas externas. La configuración mantiene credenciales en `data/mcp-servers.json`; su almacenamiento cifrado y el filtrado de herramientas con efectos externos siguen pendientes. La UI no habilita escrituras ALM tipadas. |
| Integraciones generales | No localizada como módulo | El sidebar separa Conexiones ALM y Servidores MCP; no hay un centro general de integraciones identificado. | No añadirlo por anticipado. Mantener fuentes de verdad especializadas; centralizar estado/capacidades sólo si se demuestra una necesidad sin duplicar configuración. |

### Pruebas existentes

- `tests/unit/*.test.mjs` cubre contexto/hashes, aprobación de un solo uso, invalidación de revisiones por cambios, autenticación, redacción y aislamiento de metadatos Electron.
- Ejecutado: `node --test tests/unit/*.test.mjs` — **15/15 aprobadas**.
- `prisma migrate deploy` y un round-trip SQLite de aprobación/ejecución se ejecutaron únicamente contra una base temporal aislada; no se migró `dev.db`.
- `tests/e2e/` contiene pruebas de chat, Runner y una prueba de aprobaciones que sólo comprueba que se muestra el encabezado. No se ejecutaron: el Runner puede lanzar `lint`/`build` con efectos de documentación y no hay un entorno aislado confirmado.
- No se encontraron pruebas enfocadas en los cinco espacios QA, Dashboard, Agente GUI o Configuración.

## 3. Estado de DevDocs

DevDocs **permanece presente como modal dentro del workspace**, pero las entradas de navegación relacionadas no están conectadas a él. `/devdocs-dashboard` y `/devdocs` se incluyen en la ruta dinámica de placeholders; el logo del sidebar abre la primera. No se encontró una API ni persistencia de DevDocs. La búsqueda acotada de historia en los archivos actuales no permite confirmar un traslado o renombrado histórico.

**Recomendación:** no recrear ni borrar el módulo. En una fase posterior, decidir una única entrada de navegación y reutilizar el contenido de `DevDocsModal`; comprobar primero qué documentación estática admite esa vista.

## 4. Dependencias y riesgos

1. **Cerrar el límite de confianza antes de habilitar operaciones:** `/api/agents` ofrece CRUD sin guard; `/api/fs` lee archivos sin sesión; `GET /api/projects` no exige autorización; `/api/env` falla abierto si falta el token. Revisar también accesos de lectura de `brain`, mantenimiento y webhook. Las APIs locales ya protegidas no cubren todo el proceso.
2. **Completar el límite de secretos y herramientas MCP:** el renderer ya no recibe el token de sesión de Electron; `data/mcp-servers.json` sigue siendo almacenamiento local sin cifrado. Revisar la política de herramientas MCP capaces de efectos externos antes de habilitarlas para proveedores.
3. **Hacer veraz la gobernanza:** hash y aprobación persistidos para contenido exacto; los cambios invalidan revisiones/autorizaciones. Aplicación de diffs y publicación permanecen deshabilitadas hasta que exista ejecución real verificable.
4. **Separar QA local de ALM:** Requirements/casos/planes/suites/bugs locales serán la fuente de trabajo propia. Identificadores y estados de Azure DevOps deben ser referencias de sincronización explícitas, no mezclarse con borradores locales.
5. **Runner e historial:** persistencia y salida acotada añadidas; quedan pruebas de ruta HTTP, fallos/tiempos límite reales en workspace temporal y cancelación/reintento idempotente. No convertir la lista permitida en shell libre.
6. **Documentación y pruebas:** `Context.md` y `_context/arquitectura.md` describen un estado anterior (stack, rutas y flujo). No se actualizaron en esta tarea; revisar sus generadores antes de editarlos. `npm run lint`, `build` y `db:push` ejecutan `context:update`, por lo que no son comprobaciones de solo lectura.
7. **Cambios locales:** la auditoría se basó en el worktree con modificaciones pendientes, no sólo en HEAD. No restaurar `AGENTS.md`, `dev.db` ni otros cambios como parte de tareas futuras sin autorización expresa.

## 5. Fases actualizadas

| Fase | Objetivo y alcance | Criterios de aceptación |
|---|---|---|
| **2 — Confianza y gobernanza** (incompleta; no cerrar todavía) | Guards locales/admin, aprobación persistida de Runner/MCP, hash de propuestas, registro de ejecución, historial visible y redacción básica están implementados. Sin migrar `dev.db`; no activar escrituras ALM. | Unit tests 14/14 y migración/round-trip aislados aprobados. Pendientes: pruebas HTTP negativas por ruta, integración con la DB local sólo después de backup y migración aprobada, ejecución/timeout/cancelación del Runner aislado, cobertura de errores y verificación de secretos end-to-end. |
| **3 — Auditoría de integración funcional** (realizada para esta actualización) | Construir la matriz de módulos, distinguir diseño de integración y documentar dependencias, evidencia, DevDocs y pruebas. | Documento versionable con estados y evidencias reales, riesgos abiertos y fases ordenadas. Esta fase queda cubierta por `PLAN-EVOLUCION.md`; reabrirla sólo ante cambios de alcance o nuevas pruebas. |
| **4 — QA local: Requirements y Test Cases** | Diseñar modelos y CRUD locales para requisitos y casos; reutilizar borradores del Action Agent mediante importación/vínculo explícito, sin convertirlos automáticamente en elementos aprobados o sincronizados. Añadir trazabilidad requisito–caso y validación del contexto de acción. | Crear/editar/listar/eliminar con persistencia local; distinguir borrador, activo y referencia externa; pruebas de API/UI y referencias Markdown; ninguna escritura externa. Migraciones sólo aditivas y respaldadas. |
| **5 — QA local: Plans, Suites y Bugs** | Añadir planes, ciclos, suites y defectos locales basados en las relaciones verificadas de la fase 4. Conectar Bug Reporter al historial real del Runner, sin publicar defectos a proveedores. | Relaciones y estados validados; ejecución/historial local reproducibles; errores, cancelaciones y resultados parciales registrados; pruebas con DB aislada. |
| **6 — Reconciliar Dashboard, GUI, Configuración y DevDocs** | Activar únicamente capacidades con fuente de datos y utilidad demostradas. Dashboard presenta métricas locales reales; Agente GUI se mantiene separado de Action Agent sólo si aporta acciones propias; Configuración reutiliza settings existentes; DevDocs recupera una única ruta/modal sin duplicar contenido. | Sin datos simulados ni rutas que prometan operaciones inexistentes; pruebas de navegación/estados; cada operación enlazada a un backend/persistencia identificable. |
| **7 — Verificación end-to-end local** | Cubrir chat/contexto → propuesta → revisión/aprobación → ejecución local → historial; incluir QA Management, cancelación, errores y permisos. Proveedores externos simulados y DB temporal. | Suite reproducible sin cuentas reales, archivos versionados modificados ni operaciones externas; evidencia de cada transición y ausencia de secretos en logs/respuestas. |
| **8 — Conector ALM de solo lectura** | Reutilizar safeStorage y conexiones actuales. Implementar operaciones tipadas de consulta Azure DevOps, metadatos de capacidades/estado comprobado, timeouts y errores saneados; no crear API HTTP genérica. | Pruebas simuladas para éxito, falta de configuración, permisos, red y cancelación; Action Agent sólo accede por operaciones autorizadas; historial identifica consultas y referencias. |
| **9 — Escritura controlada en Azure DevOps** (última; bloqueada) | Sólo después de cerrar Fases 2, 4, 5 y 7. Habilitar un piloto limitado de creación de un tipo de Work Item mediante una acción aprobada, con revalidación de hash y permisos en servidor. | Aprobación humana ligada al payload final; permisos mínimos; idempotencia, límites y timeouts; confirmación y trazabilidad de respuesta; pruebas de contrato/sandbox antes de habilitar cuentas reales. Jira queda fuera hasta revisar su caso y permisos por separado. |

## 6. Qué puede empezar y qué sigue bloqueado

- **Fase 2:** implementación parcial disponible para revisión. No declararla completada hasta validar las rutas y la persistencia en una DB aislada desde la aplicación, además de decidir el límite del shell nativo Electron.
- **Fase 3:** auditoría concluida para el alcance solicitado en este documento.
- **Fases 4–5:** bloqueadas para habilitar uso funcional hasta cerrar Fase 2; se pueden especificar sin migrar ni modificar datos.
- **Fase 6:** puede prepararse en paralelo a nivel de diseño. La reubicación de DevDocs no requiere recreación y puede comenzar tras acordar la ruta única; Dashboard/GUI siguen dependiendo de decidir qué capacidades reales ofrecer.
- **Fase 7:** bloqueada hasta disponer de operaciones locales verificables en QA y gobernanza.
- **Fases 8–9:** bloqueadas por pruebas finales de Fase 2, almacenamiento de secretos MCP y contratos tipados. No iniciar escrituras externas ni pruebas con credenciales reales.

## 7. Arquitectura recomendada

- **Integraciones:** conservar ALM y MCP como administradores especializados; no añadir un centro general mientras no se demuestre que evita duplicación.
- **MCP:** única fuente de configuración MCP; invocaciones controladas por el servidor y registradas como acciones.
- **Action Agent:** prepara propuestas usando contexto y herramientas registradas/autorizadas; no obtiene permisos por instrucciones Markdown ni por el mero hecho de tener un proveedor conectado.
- **Runner:** ejecuta sólo trabajos explícitos del allowlist y registra evidencia; no se convierte en terminal arbitraria.
- **Aprobaciones e Historial:** autorización humana ligada al contenido exacto y resultados veraces, incluidos fallos/cancelaciones.
- **QA Management:** espacios de trabajo locales con trazabilidad propia; las referencias ALM son enlaces/estados de sincronización gobernados, no una réplica de Jira o Azure DevOps.

## 8. Cambios y verificaciones de Fase 2

- Cambios de aplicación y una migración Prisma aditiva para `ActionApproval`, aprobación de propuestas y auditoría de Runner. `AGENTS.md`, `dev.db` y otros cambios preexistentes no se restauraron ni migraron.
- La migración se aplicó a una SQLite temporal y se verificó un round-trip de filas de aprobación/ejecución. La base local existente no se migró.
- `node --test tests/unit/*.test.mjs`: **15 aprobadas**. `npx --no-install tsc --noEmit`: aprobado. ESLint dirigido sin overrides reporta un error preexistente de `react-hooks/set-state-in-effect` en `EnvironmentVariablesPanel`; con ese baseline y el rule de CommonJS de Electron exceptuados, quedaron 0 errores y 10 warnings existentes en Electron/Webhook. `git diff --check`: aprobado.
- No se ejecutaron jobs reales del Runner, build, E2E ni llamadas MCP/ALM; los scripts `lint`/`build` pueden modificar documentación y no se alteraron archivos del workspace objetivo.
- Git sigue en `main` sobre el commit base indicado, con cambios locales de trabajo preservados y nuevos cambios pendientes de revisión; no se creó commit ni se publicó.
