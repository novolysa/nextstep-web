import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NextStep", template: "%s · NextStep" },
  description: "One inbox for things you don't want to forget.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers renders per request so the CSP nonce is applied to scripts.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body data-nonce-applied={nonce ? "true" : undefined}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
