import { expect, test } from "@playwright/test";

test("muestra el chat y permite abrir Contexto", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "¿En qué trabajamos?" })).toBeVisible();
  await page.getByRole("button", { name: "Contexto" }).click();
  await expect(page.getByRole("heading", { name: "Contexto para esta conversación" })).toBeVisible();
});
