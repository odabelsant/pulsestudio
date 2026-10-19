# Calidad TypeScript - Automatización QA

> **Mantén el proyecto verificable con tipado estricto y tests automatizados idempotentes.**

## Resumen
Este skill proporciona la guía completa para convertir los criterios de aceptación del usuario en tests automatizados utilizando BDD (Gherkin), Page Object Model (POM) en Playwright y TypeScript. Los tests son independientes, sin estado y pueden ejecutarse en cualquier pipeline CI/CD.

## Guía de Conversión de Criterios a Tests

### 1. Estructura BDD / Gherkin
Cada test comienza con un escenario claro en Given/When/Then:

```gherkin
Scenario: Usuario crea una tarea con descripición y contexto
  Given Que el usuario está en la página principal
  When El usuario llena el formulario con:
    | campo         | valor          |
    | titulo        | "Implementar QA" |
    | descripción   | " añadimos QA"  |
  And El usuario adjunta un contexto de texto
  And El usuario hace clic en "Crear tarea"
  Then La tarea debería crearse con el título correcto
  And El contexto debería aparecer en el panel lateral
```

### 2. Page Object Model (POM) en Playwright
Encapsula la UI en objetos reutilizables:

```typescript
// src/components/playwright/pages/TareaPage.ts
export class TareaPage {
  constructor(page: Page) {
    this.page = page;
    this.tituloInput = page.getByLabel("titulo");
    this.descripcionInput = page.getByLabel("descripcion");
    this.contextoInput = page.getByLabel("contexto");
    this.botonCrear = page.getByRole("button", { name: "Crear" });
  }

  async llenarFormulario(titulo: string, descripcion: string, contexto: string) {
    await this.tituloInput.fill(titulo);
    await this.descripcionInput.fill(descripcion);
    await this.contextoInput.fill(contexto);
  }

  async crear() {
    await this.botonCrear.click();
  }
}
```

### 3. Test Automatizado Idempotente
```typescript
import { test, expect } from "@playwright/test";
import { TareaPage } from "@/components/playwright/pages/TareaPage";

test("Usuario crea una tarea con descripición y contexto", async ({ page }) => {
  await page.goto("/");
  const tareaPage = new TareaPage(page);
  
  await tareaPage.llenarFormulario(
    "Implementar QA",
    "añadimos calidad automática",
    "Contexto de prueba para suite E2E de PulseStudio"
  );
  
  await tareaPage.crear();
  
  await expect(page.getByText("Implementar QA")).toBeVisible();
  await expect(page.getByText("Contexto de prueba para suite E2E de PulseStudio")).toBeVisible();
}
```

## Integración con Herramientas Externas

### n8n Workflow Integration
- Los tests pueden trigger webhooks a n8n tras aprobación
- Los datos del test (pass/fail, capturas) se envían como payload
- Los criterios de aceptación se sincronizan con las historias de usuario

### Jira/Azure DevOps Bug Reporting
- El `QaBugReporter` formatea fallos en JSON estándar:
```json
{
  "title": "Test fallido: Usuario crea una tarea...",
  "status": "Open",
  "steps_to_reproduce": [
    "Ejecutar test 'Usuario crea una tarea con descripición y contexto'",
    "Verificar que el test falle",
    "Revisar el reporte Allure"
  ],
  "expected": "Tarea creada con título y contexto visibles",
  "observed": "Error de validación o elemento no encontrado",
  "environment": "CI Pipeline",
  "screenshots": "base64_encoded_png",
  "tags": ["bdd", "playwright", "pulse-studio"]
}
```

### GitHub Actions Integration
```yaml
# .github/workflows/playwright.yml
name: Playwright Tests
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node: '20' }
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: '**/playwright-report/' }
```

## Generador de Reportes de Bug (QaBugReporter)

### Flujo de Trabajo
1. Ejecutar suite Playwright con `--output=debug`
2. Capturar output, capturas y trazas
3. Formatear a JSON estándar para la herramienta destino
4. Postear al API de la herramienta (Jira/Azure DevOps)

### Ejemplo de Formato Jira
```typescript
import { runApprovedJob } from "@/lib/runner";
import { getExecutionHistory } from "@/lib/runner";

export async function generateJiraBug(reportId: string) {
  const history = await getExecutionHistory();
  const report = history.find((r) => r.id === reportId);
  
  if (!report) throw new Error("Reporte no encontrado");
  
  const bugPayload = {
    fields: {
      summary: `Test fallido: ${report.title}`,
      description: `
        **Pasos para reproducir:**
        ${report.output?.split('\n').slice(0, 10).map((s, i) => `${i + 1}. ${s}`).join('\n')}
        
        **Criterio esperado vs obtenido:**
        - Expected: Las tareas deberían crearse con título y contexto visibles
        - Observed: ${report.output?.includes('Error') ? 'Error de validación' : 'Elemento no encontrado'}
      `,
      tags: ["bdd", "playwright", "pulse-studio"]
    }
  };
  
  // POST al API de Jira
  // return jiraClient.createIssue(bugPayload);
}
```

### Configuración Allure Reporter

Actualizar `playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";
import { test as base } from "@playwright/test";
import { allure } from "allure-playwright";

const test = allure(base);

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-failure",
    ...test.use({ ... }),
  },
  reporter: [
    ["allure-playwright",
      {
        outputs: [{ folder: "allure-results" }],
      }],
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI },
});
```

### Uso de Reports
```bash
# Generar reporte HTML
npx playwright show-report

# Servir reporte localmente
npx playwright show-report --host
```

## Flujo de Trabajo Completo

1. **Definir criterios de aceptación** en historias de usuario (BDD/Gherkin)
2. **Crear Page Objects** para encapsular componentes de UI
3. **Escribir tests idempotentes** con Given/When/Then
4. **Ejecutar suite** con `npm run test:e2e`
5. **Generar reporte Allure** con `npx playwright show-report`
6. **Formatear bug** con `QaBugReporter` para Jira/Azure DevOps
7. **Integrar resultados** en pipelines CI/CD (GitHub Actions, n8n)
8. **Mantener cobertura** y reducir deuda técnica iterativamente

## Checklist de Calidad

- [ ] Tests BDD cubren todos los flujos de usuario críticos
- [ ] Page Objects reducen duplicación en >50%
- [ ] Tests son idempotentes (pueden reejecutarse sin preparación)
- [ ] Capturas de pantalla en fallback de test failure
- [ ] Trazas disponibles para debugging
- [ ] Reportes Allure generados y versionados
- [ ] Integración con al menos una herramienta externa (Jira, Azure, n8n)
- [ ] Tests ejecutados en pipeline CI/CD en cada PR/merge