"use client";

import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { AnnouncerProvider, ApiProvider } from "@/lib/hooks";
import { I18nProvider } from "@/lib/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <ApiProvider>
          <AnnouncerProvider>
            <AppShell>{children}</AppShell>
          </AnnouncerProvider>
        </ApiProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
