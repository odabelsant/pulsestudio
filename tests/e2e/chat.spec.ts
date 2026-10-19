import { expect, test } from "@playwright/test";

test("muestra el chat y permite enviar mensaje", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "¿En qué trabajamos?" })).toBeVisible();
  await page.getByRole("textbox").fill("Hola, soy una prueba de Playwright");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByText("Hola, soy una prueba de Playwright")).toBeVisible();
});
