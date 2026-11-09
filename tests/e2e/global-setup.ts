import { createUsers } from "./users";

export default async function globalSetup() {
  for (const [name, url] of [
    ["API gateway", "http://127.0.0.1:3001/health/ready"],
    ["Keycloak", "http://127.0.0.1:18080/realms/nextstep/.well-known/openid-configuration"],
  ] as const) {
    const ok = await fetch(url).then(
      (r) => r.ok,
      () => false,
    );
    if (!ok)
      throw new Error(
        `${name} is not ready. Start the stack with nextstep-infrastructure/scripts/local-stack.mjs start`,
      );
  }
  await createUsers(2);
}
