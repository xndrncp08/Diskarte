import type { NextConfig } from "next";
import { imageHosts, serializeImageHosts } from "./src/lib/image-hosts";

const IMAGE_HOSTS = imageHosts(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);

/**
 * The Docker build (Alpine/musl) sets DISKARTE_SHARP_TARGET=linuxmusl: npm installs sharp's glibc
 * binaries alongside the musl ones and the tracer would copy both (~19 MB of dead weight).
 */
const SHARP_VARIANTS = ["sharp-linux-*", "sharp-libvips-linux-*", "sharp-darwin-*", "sharp-libvips-darwin-*", "sharp-win32-*", "sharp-wasm32"];
const SHARP_EXCLUDES = process.env.DISKARTE_SHARP_TARGET === "linuxmusl" ? SHARP_VARIANTS.map((v) => `node_modules/@img/${v}/**`) : [];

/**
 * This app is self-contained (own lockfile and node_modules) so it builds from `diskarte/` alone —
 * Render's Root Directory. Pin the root so Next doesn't reach for anything above it.
 */
const APP_ROOT = import.meta.dirname;

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
  outputFileTracingRoot: APP_ROOT,
  turbopack: { root: APP_ROOT },
  poweredByHeader: false,
  reactStrictMode: true,
  // Avatars, server icons and image attachments are resized per device and served as AVIF/WebP.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: IMAGE_HOSTS,
    deviceSizes: [640, 828, 1080, 1280, 1920],
    imageSizes: [16, 24, 32, 40, 48, 64, 80, 96, 128, 256, 384],
    minimumCacheTTL: 3600,
    // 75 = default; 40 = low-data mode (lib/low-data.ts).
    qualities: [40, 75],
    dangerouslyAllowSVG: false,
  },
  outputFileTracingExcludes: { "*": SHARP_EXCLUDES },
  // Lets <SmartImage> know at runtime which hosts the optimiser accepts (falls back to <img> otherwise).
  env: { NEXT_PUBLIC_IMAGE_HOSTS: serializeImageHosts(IMAGE_HOSTS) },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
