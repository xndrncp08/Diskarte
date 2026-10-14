import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const checks = [
  { name: "Workspace documents", path: "workspace_documents?select=id&limit=0" },
  { name: "Workspace permissions", path: "rpc/can_edit_workspace", body: { p_channel: "00000000-0000-0000-0000-000000000000" } },
];

export function databaseCheckState(status, code) {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code)) return "missing";
  // An anonymous permission denial confirms the object exists without accessing private data.
  if (status >= 200 && status < 300 || [401, 403].includes(status) && code === "42501") return "present";
  return "inconclusive";
}

/** @param {Record<string, string | undefined>} env */
export async function checkDatabase(env = process.env, request = fetch) {
  const base = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY).");
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.split(".").length === 3) headers.Authorization = `Bearer ${key}`;
  return Promise.all(checks.map(async (check) => {
    try {
      const response = await request(`${base.replace(/\/$/, "")}/rest/v1/${check.path}`, {
        method: check.body ? "POST" : "GET", headers,
        body: check.body ? JSON.stringify(check.body) : undefined,
        signal: AbortSignal.timeout(8000),
      });
      const body = await response.json().catch(() => null);
      return { name: check.name, state: databaseCheckState(response.status, body?.code) };
    } catch { return { name: check.name, state: "inconclusive" }; }
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = fileURLToPath(new URL("../.env.local", import.meta.url));
  if (existsSync(envFile) && process.loadEnvFile) process.loadEnvFile(envFile);
  try {
    const results = await checkDatabase();
    for (const result of results) console.log(`${result.name}: ${result.state}`);
    if (results.some((result) => result.state === "missing")) {
      console.error("Apply supabase/migrations/20261014010000_shared_workspace.sql to the configured project, then rerun this check.");
      process.exitCode = 2;
    } else if (results.some((result) => result.state === "inconclusive")) {
      console.error("Could not confirm database readiness. Check configuration and connectivity.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
