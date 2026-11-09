import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

const keycloak = "http://127.0.0.1:18080";
const stateFile = path.resolve(import.meta.dirname, "../../playwright/.auth/users.json");
export type TestUser = { id: string; username: string; password: string };

function infraEnv(): Record<string, string> {
  const file =
    process.env.NEXTSTEP_INFRA_ENV ?? path.resolve(import.meta.dirname, "../../../nextstep-infrastructure/.env");
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

async function adminToken(): Promise<string> {
  const env = infraEnv();
  const response = await fetch(`${keycloak}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "admin-cli",
      grant_type: "password",
      username: env.KEYCLOAK_ADMIN_USER!,
      password: env.KEYCLOAK_ADMIN_PASSWORD!,
    }),
  });
  if (!response.ok) throw new Error(`Keycloak admin login failed: ${response.status}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

/** Create synthetic, verified Keycloak users for this run. */
export async function createUsers(count: number): Promise<TestUser[]> {
  const token = await adminToken();
  const users: TestUser[] = [];
  for (let i = 0; i < count; i++) {
    const username = `e2e-${randomUUID().slice(0, 8)}`;
    const password = `${randomBytes(12).toString("base64url")}aA1!`;
    const response = await fetch(`${keycloak}/admin/realms/nextstep/users`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        username,
        enabled: true,
        email: `${username}@example.invalid`,
        emailVerified: true,
        firstName: "E2E",
        lastName: `User ${i + 1}`,
        credentials: [{ type: "password", value: password, temporary: false }],
      }),
    });
    if (response.status !== 201) throw new Error(`Creating test user failed: ${response.status}`);
    users.push({ id: response.headers.get("location")!.split("/").pop()!, username, password });
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(users), { mode: 0o600 });
  return users;
}

export async function deleteUsers(): Promise<void> {
  if (!fs.existsSync(stateFile)) return;
  const users = JSON.parse(fs.readFileSync(stateFile, "utf8")) as TestUser[];
  const token = await adminToken();
  for (const user of users)
    await fetch(`${keycloak}/admin/realms/nextstep/users/${user.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  fs.rmSync(stateFile, { force: true });
}

export function testUsers(): TestUser[] {
  return JSON.parse(fs.readFileSync(stateFile, "utf8")) as TestUser[];
}

/** Open a page and sign in through the real Keycloak login form if prompted. */
export async function signIn(page: Page, user: TestUser, path = "/"): Promise<void> {
  await page.goto(path);
  const login = page.locator("#kc-form-login, #username");
  const app = page.getByRole("navigation", { name: "Primary" });
  await expect(login.or(app).first()).toBeVisible({ timeout: 30_000 });
  if (await login.first().isVisible()) {
    await page.locator("#username").fill(user.username);
    await page.locator("#password").fill(user.password);
    await page.locator("#kc-login").click();
  }
  await expect(app).toBeVisible({ timeout: 30_000 });
}
