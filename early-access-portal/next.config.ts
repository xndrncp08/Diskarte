import path from "node:path";
import type { NextConfig } from "next";

/** npm workspace root (diskarte/ + early-access-portal/ share one lockfile). */
const REPO_ROOT = path.join(import.meta.dirname, "..");

/** Static security headers; the nonce-based CSP is set per request in src/proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // npm workspaces hoist dependencies to the repo root, so trace from there. On Vercel this is
  // the default "include files outside the root directory" behaviour; in Docker the server lands
  // at .next/standalone/early-access-portal/server.js.
  turbopack: { root: REPO_ROOT },
  outputFileTracingRoot: REPO_ROOT,
  // No next/image here (brand art is static SVG), so skip the optimiser and keep sharp — hoisted
  // into the workspace by the Diskarte app — out of the traced output.
  images: { unoptimized: true },
  outputFileTracingExcludes: { "*": ["../node_modules/sharp/**", "../node_modules/@img/**", "node_modules/sharp/**", "node_modules/@img/**"] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
