// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/** diskarte/ (this app, its own Docker context) and the repository root (Render Blueprint, compose). */
const app = path.resolve(__dirname, "../..");
const repo = path.resolve(app, "..");
const read = (file: string) => fs.readFileSync(path.join(app, file), "utf8");
const readRepo = (file: string) => fs.readFileSync(path.join(repo, file), "utf8");

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];

describe("deployment configuration", () => {
  it("builds Next.js in standalone mode with AVIF/WebP image optimisation for allow-listed hosts", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.images?.unoptimized).toBeFalsy();
    expect(nextConfig.images?.formats).toEqual(["image/avif", "image/webp"]);
    expect(nextConfig.images?.dangerouslyAllowSVG).toBe(false);
    const hosts = (nextConfig.images?.remotePatterns ?? []).map((p) => (p instanceof URL ? p.hostname : p.hostname));
    expect(hosts).toEqual(expect.arrayContaining(["**.supabase.co", "avatars.githubusercontent.com"]));
    expect(hosts).not.toContain("**");
  });

  it("ships a multi-stage, non-root Dockerfile with a health check", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile.match(/^FROM /gm)?.length).toBeGreaterThanOrEqual(3);
    expect(dockerfile).toContain(".next/standalone");
    expect(dockerfile).toContain(".next/static");
    expect(dockerfile).toMatch(/^USER nextjs$/m);
    expect(dockerfile).toMatch(/HEALTHCHECK[\s\S]*\/api\/health/);
    expect(dockerfile).toMatch(/CMD \["node", "server.js"\]/);
    // Self-contained: Render only exposes the service's root directory (diskarte/) to the build.
    expect(dockerfile).toMatch(/COPY package.json package-lock.json/);
    expect(fs.existsSync(path.join(app, "package-lock.json"))).toBe(true);
  });

  it("keeps secrets and bulky folders out of the build context", () => {
    const ignore = read(".dockerignore").split("\n").map((l) => l.trim());
    for (const entry of ["node_modules", ".next", ".git", ".env", ".env.*"]) expect(ignore).toContain(entry);
    expect(ignore).toContain("!.env.example");
  });

  it("deploys to Render's free Docker tier with the health endpoint and every required variable", () => {
    const render = readRepo("render.yaml");
    expect(render).toMatch(/runtime: docker/);
    expect(render).toMatch(/plan: free/);
    expect(render).toMatch(/healthCheckPath: \/api\/health/);
    expect(render).toMatch(/rootDir: diskarte/);
    expect(render).toMatch(/dockerfilePath: \.\/Dockerfile/);
    for (const key of REQUIRED_ENV) expect(render).toContain(`key: ${key}`);
  });

  it("documents every required variable in .env.example and DEPLOYMENT.md", () => {
    const example = read(".env.example");
    const guide = read("DEPLOYMENT.md");
    for (const key of REQUIRED_ENV) {
      expect(example).toMatch(new RegExp(`^${key}=`, "m"));
      expect(guide).toContain(key);
    }
  });

  it("wires a health check into docker compose", () => {
    const compose = readRepo("docker-compose.yml");
    expect(compose).toMatch(/healthcheck:[\s\S]*\/api\/health/);
    expect(compose).toMatch(/no-new-privileges/);
  });
});
