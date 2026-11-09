import { expect, test } from "@playwright/test";
import { signIn, testUsers } from "./users";

const API = "http://127.0.0.1:3001/api/v1";
const FAKE = "00000000-0000-4000-8000-0000000000aa";

test("failed processing explains the failure and allows retry", async ({ page }) => {
  const [user] = testUsers();
  let status = "failed";
  // Simulated API responses for one capture: the local fake provider never fails on demand.
  await page.route(`${API}/captures/${FAKE}`, (route) =>
    route.fulfill({
      json: {
        id: FAKE,
        status,
        createdAt: "2026-11-09T10:00:00.000Z",
        ...(status === "failed"
          ? { failure: { code: "PROCESSING_FAILED", message: "x", requestId: "req-fail-1" } }
          : {}),
      },
    }),
  );
  await page.route(`${API}/captures/${FAKE}/content`, (route) =>
    route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "task: Renew passport" }),
  );
  await page.route(`${API}/captures/${FAKE}/retry`, (route) => {
    status = "processing";
    return route.fulfill({ json: { id: FAKE, status: "processing", createdAt: "2026-11-09T10:00:00.000Z" } });
  });
  await signIn(page, user!, `/captures/${FAKE}`);
  const failed = page.getByTestId("failed");
  await expect(failed).toContainText("Processing didn't finish.");
  await expect(failed).toContainText("req-fail-1");
  await failed.getByRole("button", { name: "Retry processing" }).click();
  await expect(page.getByTestId("processing")).toBeVisible();
  await expect(page.getByTestId("announcer")).toHaveText("Processing restarted.");
});

test("an expired session is reported with a way to sign in again", async ({ page }) => {
  const [user] = testUsers();
  await signIn(page, user!, "/actions");
  await page.route(`${API}/captures?**`, (route) =>
    route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", message: "x", requestId: "req-401" } }),
  );
  await page.getByRole("link", { name: "Inbox" }).click();
  const banner = page.getByTestId("session-expired");
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Sign in again" })).toBeVisible();
});

test("offline state is announced and requests fail clearly", async ({ page, context }) => {
  const [user] = testUsers();
  await signIn(page, user!, "/capture");
  await context.setOffline(true);
  await expect(page.getByText("You're offline. Changes can't be saved until you reconnect.").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Text" }).fill("task: Offline test");
  await page.getByRole("button", { name: "Capture text" }).click();
  await expect(page.locator("[data-error-kind]")).toHaveAttribute("data-error-kind", /offline|network/);
  await context.setOffline(false);
  await expect(page.locator(".banner-warning")).toHaveCount(0);
});

test("features without a backing service say so instead of pretending", async ({ page }) => {
  const [user] = testUsers();
  await signIn(page, user!, "/settings");
  await expect(page.getByText(/saved on this device only/)).toBeVisible();
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(page.getByText("This server doesn't support this yet. Nothing was requested.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Request account deletion" })).toBeDisabled();
});
