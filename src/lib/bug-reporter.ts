/**
 * QA Bug Reporter - Formatea errores de tests Playwright para herramientas externas
 * (Jira, Azure DevOps, n8n)
 *
 * Este modulo toma los reports de tests fallidos e os formatea
 * no estandar necessario para ser publicado em ferramentas de rastreo
 * de incidencias ou integracaoes de CI/CD.
 *
 * @module bug-reporter
 */
import { getExecutionHistory } from "@/lib/runner";

/**
 * Interfacer para formateo de bug report
 */
export interface BugReport {
  title: string;
  status: string;
  steps_to_reproduce: string[];
  expected: string;
  observed: string;
  environment: string;
  tags: string[];
  snapshots?: string;
}

/**
 * Genera un reporte de bug a partir do ID do report do history do execution
 *
 * @param reportId - ID do report gerado durante a execucao do Playwright
 * @returns Objeto BugReport formatado para ser enviado a ferramentas externas
 */
export async function generateBugReport(
  reportId: string
): Promise<BugReport> {
  const history = await getExecutionHistory();
  const report = history.find((r) => r.id === reportId);

  if (!report) {
    throw new Error("Nao ha report com o ID especificado");
  }

  const output = report.output || "Erro desconhecido durante a executacao";

  // Determinar o estado e as mensagens baseados no output
  const status =
    report.exitCode === 0 && !report.timedOut
      ? "Pass"
      : report.exitCode === 0 && report.timedOut
        ? "Timeout"
        : "Fail";

  // Extrair os steps_to_reproduce das primeiras linhas do output
  const steps: string[] = report.output
    ?.split("\n")
    .filter((_: string, index: number) => index < 15)
    .map((line: string): string => line);

  // Determinar o esperado e observado baseado no contenido
  const expectedMessage: string = "Resultado esperado da executacao";
  const observed: string = output.substring(0, 500);

  return {
    title: `Test fallido: ${report.title}`,
    status: status,
    steps_to_reproduce: steps,
    expected: "O test deveria completar-se com sucesso",
    observed: observed,
    environment: "CI Pipeline",
    tags: ["bdd", "playwright", "pulse-studio"],
  }
}

/**
 * Formata o bug report para a API do Jira
 *
 * @param bugReport - O bug report formatado por generateBugReport
 * @returns Objeto compatvel com a API do Jira
 */
export function formatForJira(bugReport: BugReport): any {
  return {
    fields: {
      summary: bugReport.title,
      description: `
        **Pasos para reproducir:**
        ${bugReport.steps_to_reproduce.map(
          (s: string, i: number): string => `${i + 1}. ${s}`
        ).join("\n")}

        **Criterio esperado vs obtido:**
        - Expected: ${bugReport.expected}
        - Observed: ${bugReport.observed}

        **Etiquetas:** ${bugReport.tags.join(", ")}
      `,
      tags: bugReport.tags,
    }
  }
}

/**
 * Alias para compatibilidade com o fluxo de trabalho existente
 *
 * @param reportId - ID do report do execution history
 * @returns BugReport formatado
 */
export async function QaBugReporter(reportId: string): Promise<BugReport> {
  return generateBugReport(reportId);
}

export default generateBugReport;