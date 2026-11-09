import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn, testUsers } from "./users";

async function scan(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("sign-in page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in to NextStep" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("core screens have no WCAG A/AA violations, including review and RTL", async ({ page }) => {
  const [user] = testUsers();
  await signIn(page, user!, "/");
  for (const path of ["/", "/capture", "/actions", "/actions/new", "/lists", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await scan(page), path).toEqual([]);
  }
  await page.goto("/capture");
  await page.getByRole("textbox", { name: "Text" }).fill("reminder: Call the dentist | date: 03/04");
  await page.getByRole("button", { name: "Capture text" }).click();
  await expect(page.getByTestId("suggestion")).toBeVisible({ timeout: 30_000 });
  expect(await scan(page), "review").toEqual([]);

  // Right-to-left layout through the display locale setting.
  await page.goto("/settings");
  await page.getByLabel("Display format").selectOption("ar-EG");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.waitForLoadState("networkidle");
  expect(await scan(page), "rtl inbox").toEqual([]);
});

test("keyboard users can skip to content and see focus", async ({ page }) => {
  const [user] = testUsers();
  await signIn(page, user!, "/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("");
});
