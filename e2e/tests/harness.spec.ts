import { test, expect } from "../fixtures";

test("loads the public referral landing page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/referrals\/welcome$/);
  await expect(page.getByRole("heading", { name: "Referrals Program" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join the Program" })).toBeVisible();
});
