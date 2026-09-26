import type { NextConfig } from "next";

/** Static security headers; the per-request CSP (with a script nonce) is set in src/proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // All user images are served straight from Supabase Storage / OAuth CDNs via <img>, so the
  // built-in optimiser (and its ~28 MB sharp/libvips binaries) is left out of the container.
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**", "node_modules/@emnapi/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
