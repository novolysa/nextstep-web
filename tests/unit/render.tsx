import { render } from "@testing-library/react";
import axe from "axe-core";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import type { Api } from "@/lib/api/client";
import { AnnouncerProvider, ApiProvider } from "@/lib/hooks";
import { I18nProvider } from "@/lib/i18n";

export function renderWithProviders(ui: React.ReactElement, api: Partial<Api> = {}) {
  return render(
    <I18nProvider>
      <AuthProvider>
        <ApiProvider api={api as Api}>
          <AnnouncerProvider>{ui}</AnnouncerProvider>
        </ApiProvider>
      </AuthProvider>
    </I18nProvider>,
  );
}

/** Serious or critical axe violations in the rendered container. */
export async function seriousViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { region: { enabled: false } } });
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}
