import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signIn, testUsers } from "./users";

const run = () => randomUUID().slice(0, 6);

async function captureText(page: import("@playwright/test").Page, text: string) {
  await page.goto("/capture");
  await page.getByRole("textbox", { name: "Text" }).fill(text);
  await page.getByRole("button", { name: "Capture text" }).click();
  await expect(page).toHaveURL(/\/captures\/[0-9a-f-]{36}$/);
}

test("capture → review and correct → accept creates an action linked to its source", async ({ page }) => {
  const [user] = testUsers();
  const title = `Pay rent ${run()}`;
  await signIn(page, user!, "/capture");
  await captureText(page, `task: ${title} | date: Friday`);

  await expect(page.locator(".original-text")).toContainText(title);
  const card = page.getByTestId("suggestion");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("mark")).toHaveText("Friday");
  await expect(card.getByText(/Proposed date: .*“Friday”/)).toBeVisible();

  await card.getByRole("textbox", { name: /^Title/ }).fill(`${title} (edited)`);
  const due = card.getByRole("group", { name: /Due date/ });
  await due.getByLabel("Date").fill("2026-12-04");
  await due.getByLabel("Time").fill("18:00");
  await card.getByLabel("Time zone", { exact: true }).selectOption("Europe/Berlin");
  await expect(due.getByText(/Saved as/)).toContainText("6:00");

  await card.getByRole("button", { name: "Accept" }).click();
  await expect(card.getByText("Confirm the date and time before accepting.")).toBeVisible();
  await card.getByLabel(/I've checked the date/).check();
  await card.getByRole("button", { name: "Accept" }).click();
  const view = page.getByRole("link", { name: `View action: ${title} (edited)` });
  await expect(view).toBeVisible();
  await view.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${title} (edited)`);
  await expect(page.getByText("Europe/Berlin")).toBeVisible();
  await expect(page.locator(".details")).toContainText("Dec 4, 2026");

  await page.getByRole("link", { name: "View source capture" }).click();
  await expect(page.getByText("Already reviewed")).toBeVisible();

  await page.getByRole("link", { name: "Actions" }).click();
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(page.getByTestId("action-list")).toContainText(`${title} (edited)`);
});

test("dismissing a suggestion saves nothing", async ({ page }) => {
  const [user] = testUsers();
  const item = `Eggs ${run()}`;
  await signIn(page, user!, "/capture");
  await captureText(page, `list_item: ${item}`);
  const card = page.getByTestId("suggestion");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Already reviewed")).toBeVisible();
  await expect(page.locator(".item", { hasText: item })).toContainText("Dismissed");
  await page.goto("/actions");
  await page.getByRole("button", { name: "Completed" }).click();
  await expect(page.getByText(item)).toHaveCount(0);
});

test("time zone entry handles DST gaps and repeated hours explicitly", async ({ page }) => {
  const [user] = testUsers();
  const title = `Late show ${run()}`;
  await signIn(page, user!, "/actions/new");
  await page.getByLabel("Type").selectOption("event");
  await page.getByRole("textbox", { name: /^Title/ }).fill(title);
  const start = page.getByRole("group", { name: /^Starts/ });
  await page.getByLabel("Time zone", { exact: true }).selectOption("America/New_York");
  await start.getByLabel("Date").fill("2026-03-08");
  await start.getByLabel("Time").fill("02:30");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(start.getByText(/doesn't exist in America\/New_York/)).toBeVisible();

  await start.getByLabel("Date").fill("2026-11-01");
  await start.getByLabel("Time").fill("01:30");
  await expect(start.getByText(/happens twice/).first()).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/actions\/new/);
  await start.getByLabel(/Second occurrence/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.locator(".details")).toContainText("1:30");
  await expect(page.locator(".details")).toContainText("EST");
});

test("another user's capture is not accessible", async ({ browser }) => {
  const [owner, other] = testUsers();
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, owner!, "/capture");
  await captureText(ownerPage, `task: Private note ${run()}`);
  const url = ownerPage.url();
  await ownerContext.close();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, other!, "/");
  await otherPage.goto(url);
  await expect(otherPage.locator('[data-error-kind="not-found"]')).toContainText(
    "doesn't exist or you don't have access",
  );
  await expect(otherPage.locator(".original-text")).toHaveCount(0);
  await otherContext.close();
});

test("a free-form plan becomes several suggestions that can be dated together and dismissed", async ({ page }) => {
  const [user] = testUsers();
  const id = run();
  await signIn(page, user!, "/capture");
  await captureText(
    page,
    [
      `# Plan ${id}`,
      "## Morning",
      `- [ ] 9:00 Call the dentist ${id}`,
      `- [ ] Email Sam about the invoice ${id}`,
      "## Groceries",
      `- Oat milk ${id}`,
      `- [x] Already done ${id}`,
    ].join("\n"),
  );

  const cards = page.getByTestId("suggestion");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  await expect(cards).toHaveCount(3);
  await expect(page.getByText("3 suggestions to review")).toBeVisible();
  await expect(page.getByText(`Already done ${id}`, { exact: true })).toHaveCount(0);

  const dentist = cards.filter({ hasText: `Call the dentist ${id}` });
  await expect(dentist.getByRole("group", { name: /date/i }).first().getByLabel("Time")).toHaveValue("09:00");

  const tools = page.getByTestId("bulk-tools");
  await tools.getByLabel("Date for all suggestions").fill("2026-11-10");
  await tools.getByRole("button", { name: "Apply to all suggestions" }).click();
  await expect(dentist.getByRole("group", { name: /date/i }).first().getByLabel("Date")).toHaveValue("2026-11-10");

  await dentist.getByLabel(/I've checked the date/).check();
  await dentist.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("link", { name: `View action: Call the dentist ${id}` })).toBeVisible();

  await tools.getByRole("button", { name: "Dismiss all remaining" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Dismiss all remaining" }).click();
  await expect(cards).toHaveCount(0);
});
