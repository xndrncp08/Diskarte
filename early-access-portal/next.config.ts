import type { NextConfig } from "next";

/**
 * Self-contained app (own lockfile and node_modules): it builds from `early-access-portal/` alone,
 * which is Vercel's Root Directory. Pin the root so Next never reaches above it.
 */
const APP_ROOT = import.meta.dirname;

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
  turbopack: { root: APP_ROOT },
  outputFileTracingRoot: APP_ROOT,
  // No next/image here (brand art is static SVG), so skip the image optimiser entirely.
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
