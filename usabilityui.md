# Guía de uso de PulseStudio

> Guía personal generada automáticamente. Se actualiza al iniciar, validar, compilar o sincronizar el contexto del proyecto. No contiene secretos.

**Última actualización:** 14 de octubre de 2026, 6:04 p. m.

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

Es la última barrera antes de modificar código. El chat prepara un diff; aquí lo revisas, registras la revisión de Arquitecto y Juez, das tu aprobación humana y luego puedes aplicarlo en una rama segura. Nunca escribe directamente en `main`.

## Botón + dentro del chat

- **Adjuntar contexto:** abre Contexto para añadir archivos a esta conversación.
- **Configurar skills:** abre el selector de reglas activas.
- **Ejecutar verificación:** abre el Runner seguro.
- **Crear aprobación:** abre el flujo para revisar un diff propuesto.

## Perfiles de proyecto

Un perfil indica sobre qué carpeta trabaja el Runner y dónde se aplicarían propuestas aprobadas. Hoy se administra mediante la API local de proyectos; la próxima mejora será una pantalla visual para hacerlo desde la aplicación.

## Novedades recientes detectadas

- Se actualizó: **La Terminal interactiva y Agente GUI**.

