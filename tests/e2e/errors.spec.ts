import { expect, test } from "@playwright/test";

test("manejo de errores en propuestas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Propuestas" }).click();
  await page.getByRole("button", { name: "Crear propuesta" }).click();
  await expect(page.getByText("error")).toBeVisible();
});
