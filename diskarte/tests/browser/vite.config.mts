import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const app = resolve(import.meta.dirname, "../..");

/** Isolated UI fixture: server actions cannot mutate a real account or reach a database. */
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(app, "public"),
  plugins: [
    {
      name: "fixture-server-boundaries",
      enforce: "pre",
      transform(source, id) {
        if (
          !id.startsWith(resolve(app, "src/actions") + "/") &&
          !/src\/app\/\(auth\)\/.*actions\.ts$/.test(id)
        )
          return;
        const names = [
          ...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g),
        ].map((match) => match[1]);
        return names
          .map(
            (name) =>
              `export async function ${name}() { throw new Error("Read-only browser fixture: server actions are unavailable."); }`,
          )
          .join("\n");
      },
    },
    react(),
  ],
  resolve: {
    alias: [
      {
        find: "next/navigation",
        replacement: resolve(import.meta.dirname, "navigation.ts"),
      },
      {
        find: "next/link",
        replacement: resolve(import.meta.dirname, "next.tsx"),
      },
      {
        find: "next/image",
        replacement: resolve(import.meta.dirname, "image.tsx"),
      },
      {
        find: "next/dynamic",
        replacement: resolve(import.meta.dirname, "dynamic.tsx"),
      },
      {
        find: "@/lib/supabase/browser",
        replacement: resolve(import.meta.dirname, "database.ts"),
      },
      { find: "vitest", replacement: resolve(import.meta.dirname, "spy.ts") },
      { find: "@", replacement: resolve(app, "src") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 3130,
    strictPort: true,
    fs: { allow: [app] },
  },
});
