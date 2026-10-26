import { test, expect } from "@playwright/test";

test("deployed checkout validates the address and cannot submit in staging mode", async ({ page }) => {
  await page.goto("/order/new");
  await expect(page.getByRole("heading", { name: /Build an Order/i })).toBeVisible();

  await page.getByRole("tab", { name: /Type Codes/i }).click();

  const codeInput = page.locator("textarea").first();
  await codeInput.fill("B12");
  const matchButton = page.getByRole("button", { name: /match/i }).first();
  if (await matchButton.isVisible().catch(() => false)) await matchButton.click();
  await expect(page.getByText(/B12/i).first()).toBeVisible();

  await page.getByLabel("Name").fill("Playwright Staging Test");
  await page.getByLabel("Email *").fill("playwright-staging@example.com");
  await page.getByLabel("Phone *").fill("9415550199");
  await page.getByLabel("Delivery address *").fill("123 Test Avenue");
  await page.getByLabel("City *").fill("Osprey");
  await page.getByLabel("Delivery ZIP *").fill("34229");

  const state = page.locator("#ord-state");
  await state.click();
  await page.getByRole("option", { name: "Florida" }).click();

  await expect(page.getByRole("status").filter({ hasText: /Staging test mode/i })).toBeVisible();
  const submit = page.getByRole("button", { name: /Submit order request/i });
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/submission is disabled/i).first()).toBeVisible();
});
