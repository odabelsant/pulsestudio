import { expect, test } from "@playwright/test";

test("flujo de aprobación de propuesta", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Propuestas" }).click();
  await expect(page.getByRole("heading", { name: "Cambios gobernados" })).toBeVisible();
});
