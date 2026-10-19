import { expect, test } from "@playwright/test";

test("ejecuta lint y muestra resultado", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Runner" }).click();
  await page.getByRole("button", { name: "Ejecutar lint" }).click();
  await expect(page.getByText("lint")).toBeVisible();
});

test("cancelar ejecución del runner", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Runner" }).click();
  await page.getByRole("button", { name: "Ejecutar lint" }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Cancelado")).toBeVisible();
});
