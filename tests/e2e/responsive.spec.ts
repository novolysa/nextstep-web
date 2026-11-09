import { expect, test } from "@playwright/test";
import { signIn, testUsers } from "./users";

test("small screens have no horizontal overflow and keep navigation reachable", async ({ page }) => {
  const [user] = testUsers();
  await signIn(page, user!, "/");
  for (const path of ["/", "/capture", "/actions", "/actions/new", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Capture" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New capture");
  const box = await page.getByRole("button", { name: "Capture text" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
