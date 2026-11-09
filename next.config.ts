import type { NextConfig } from "next";

// Security headers that do not depend on the per-request nonce; CSP is set in src/proxy.ts.
const config: NextConfig = {
  reactStrictMode: true,
  // Standalone server output for the container image only (see Dockerfile).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default config;
