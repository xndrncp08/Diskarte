/**
 * Generates docs/reference/database.md from the migrations themselves: it boots the same
 * in-memory Postgres the RLS tests use (PGlite + tests/db/supabase-shim.sql), applies every file in
 * supabase/migrations, and reads the catalog. The SQL comment block directly above each
 * `create table` / `create function` becomes its description.
 *
 *   npm run docs:db            # rewrite the reference
 *   npm run docs:db -- --check # exit 1 if the committed reference is stale (CI runs this via Vitest)
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const APP = path.resolve(import.meta.dirname, "..");
const ROOT = path.resolve(APP, "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
export const OUTPUT = path.join(ROOT, "docs/reference/database.md");
const SCHEMAS = ["public", "private_push"];

type Row = Record<string, unknown>;

/** `-- comment` blocks directly above create table/function statements, keyed by qualified name. */
function sqlComments(files: string[]) {
  const comments = new Map<string, string>();
  const origin = new Map<string, string[]>();
  const create = /^\s*create\s+(?:or\s+replace\s+)?(table|function)\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z_]+)"?\.)?"?([a-z_0-9]+)"?/i;
  for (const file of files) {
    let buffer: string[] = [];
    let inBlock = false;
    for (const line of fs.readFileSync(path.join(MIGRATIONS, file), "utf8").split("\n")) {
      // `/** … */` blocks count like `--` lines.
      if (inBlock || /^\s*\/\*/.test(line)) {
        const text = line.replace(/^\s*\/\*\*?/, "").replace(/\*\/\s*$/, "").replace(/^\s*\*\s?/, "").trim();
        if (text) buffer.push(text);
        inBlock = !/\*\/\s*$/.test(line);
        continue;
      }
      const comment = /^\s*--\s?(.*)$/.exec(line);
      if (comment) {
        if (!/^[=\-─\s]*$/.test(comment[1])) buffer.push(comment[1].trim());
        continue;
      }
      const match = create.exec(line);
      if (match) {
        const key = `${match[1].toLowerCase()}:${(match[2] ?? "public").toLowerCase()}.${match[3].toLowerCase()}`;
        // The latest definition's comment wins; a redefinition without one drops the stale text.
        if (buffer.length) comments.set(key, buffer.join(" ").replace(/^\d+\)\s*/, ""));
        else comments.delete(key);
        origin.set(key, [...new Set([...(origin.get(key) ?? []), file.replace(/\.sql$/, "")])]);
      }
      buffer = [];
    }
  }
  return { comments, origin };
}

const md = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const code = (value: unknown) => (value === null || value === undefined || value === "" ? "" : `\`${md(value).replace(/`/g, "'")}\``);

export async function generate(): Promise<string> {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(fs.readFileSync(path.join(APP, "tests/db/supabase-shim.sql"), "utf8"));
  for (const file of files) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  const q = async (sql: string, params: unknown[] = []) => (await db.query<Row>(sql, params)).rows;
  const { comments, origin } = sqlComments(files);

  const tables = await q(
    `select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.oid
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r','p') and n.nspname = any($1) order by 1, 2`,
    [SCHEMAS],
  );
  const columns = await q(
    `select a.attrelid as oid, a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull,
            pg_get_expr(d.adbin, d.adrelid) as def, a.attgenerated as generated, a.attidentity as identity
       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attnum > 0 and not a.attisdropped order by a.attnum`,
  );
  const constraints = await q(
    `select conrelid as oid, conname as name, contype as type, pg_get_constraintdef(oid) as def
       from pg_constraint where conrelid <> 0 and contype <> 'n' order by contype, conname`,
  );
  const indexes = await q(
    `select i.indrelid as oid, c.relname as name, pg_get_indexdef(i.indexrelid) as def
       from pg_index i join pg_class c on c.oid = i.indexrelid
      where not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid) order by c.relname`,
  );
  const policies = await q(
    `select schemaname as schema, tablename as table, policyname as name, permissive, roles::text[] as roles, cmd, qual, with_check
       from pg_policies order by schemaname, tablename, policyname`,
  );
  const triggers = await q(
    `select t.tgrelid as oid, t.tgname as name, pg_get_triggerdef(t.oid) as def
       from pg_trigger t where not t.tgisinternal order by t.tgname`,
  );
  const functions = await q(
    `select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
            pg_get_function_result(p.oid) as result, p.prosecdef as definer, p.provolatile as volatility,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as authed,
            exists (select 1 from pg_trigger t where t.tgfoid = p.oid) as is_trigger,
            p.prorettype = 'trigger'::regtype as returns_trigger
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = any($1) and p.prokind = 'f' order by 1, 2, 3`,
    [SCHEMAS],
  );
  const enums = await q(
    `select n.nspname as schema, t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
       from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = any($1) group by 1, 2 order by 1, 2`,
    [SCHEMAS],
  );
  const publication = await q(`select schemaname as schema, tablename as name from pg_publication_tables where pubname = 'supabase_realtime' order by 1, 2`);
  const buckets = await q(`select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id`);
  const grants = await q(
    `select table_schema as schema, table_name as name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
       from information_schema.role_table_grants
      where table_schema = any($1) and grantee in ('anon', 'authenticated')
      group by 1, 2, 3 order by 1, 2, 3`,
    [SCHEMAS],
  );
  await db.close();

  const by = <T extends Row>(list: T[], key: string) => {
    const map = new Map<unknown, T[]>();
    for (const row of list) map.set(row[key], [...(map.get(row[key]) ?? []), row]);
    return map;
  };
  const colsBy = by(columns, "oid"), consBy = by(constraints, "oid"), idxBy = by(indexes, "oid"), trgBy = by(triggers, "oid");
  const polBy = by(policies.map((p): Row => ({ ...p, key: `${p.schema}.${p.table}` })), "key");
  const grantBy = by(grants.map((g): Row => ({ ...g, key: `${g.schema}.${g.name}` })), "key");
  const published = new Set(publication.map((p) => `${p.schema}.${p.name}`));
  const anchor = (schema: unknown, name: unknown) => `${schema}-${name}`.replace(/_/g, "-");

  const out: string[] = [];
  out.push(
    "# Database reference",
    "",
    "> **Generated file — do not edit by hand.** Rebuild with `npm run docs:db --prefix diskarte` after changing",
    "> `supabase/migrations/`. The Vitest suite fails when this file is stale. Descriptions come from the SQL",
    "> comment directly above each `create table` / `create function`, so document objects there.",
    "",
    `Built by applying all ${files.length} migrations to PGlite with the Supabase stand-ins in`,
    "`diskarte/tests/db/supabase-shim.sql`. Supabase-managed schemas (`auth`, `storage`, `realtime`) are only",
    "shown where Diskarte adds policies or rows. Table grants reflect Supabase's default privileges (mirrored by",
    "the shim) minus the migrations' revokes; RLS policies, not grants, decide which rows a role sees.",
    "For the narrative overview see [database.md](../database.md).",
    "",
    `**${tables.length} tables · ${policies.length} RLS policies · ${functions.length} functions · ${triggers.length} triggers · ${publication.length} Realtime tables · ${buckets.length} Storage buckets**`,
    "",
    "## Contents",
    "",
    "- [Tables](#tables)",
    "- [Enums](#enums)",
    "- [Functions](#functions)",
    "- [Realtime publication](#realtime-publication)",
    "- [Storage buckets and policies](#storage-buckets-and-policies)",
    "- [Realtime channel authorization](#realtime-channel-authorization)",
    "- [Foreign-key map](#foreign-key-map)",
    "- [Migration history](#migration-history)",
    "",
    "## Tables",
    "",
    "| Table | RLS | Realtime | Description |",
    "| --- | --- | --- | --- |",
  );
  for (const t of tables) {
    const desc = comments.get(`table:${t.schema}.${t.name}`) ?? "";
    out.push(`| [\`${t.schema}.${t.name}\`](#${anchor(t.schema, t.name)}) | ${t.rls ? "on" : "**off**"} | ${published.has(`${t.schema}.${t.name}`) ? "yes" : ""} | ${md(desc.length > 160 ? `${desc.slice(0, 157)}…` : desc)} |`);
  }
  out.push("");

  for (const t of tables) {
    const key = `${t.schema}.${t.name}`;
    out.push(`<a id="${anchor(t.schema, t.name)}"></a>`, "", `### \`${key}\``, "");
    const desc = comments.get(`table:${key}`);
    if (desc) out.push(md(desc), "");
    const defined = origin.get(`table:${key}`);
    const tableGrants = grantBy.get(key) ?? [];
    out.push(
      `RLS **${t.rls ? "enabled" : "disabled"}**${published.has(key) ? " · in the `supabase_realtime` publication" : ""}${defined ? ` · created in \`${defined[0]}\`` : ""}`,
      "",
      `Grants: ${tableGrants.length ? tableGrants.map((g) => `\`${g.grantee}\` ${g.privileges}`).join("; ") : "none to `anon` / `authenticated` (reachable only through functions)"}`,
      "",
      "| Column | Type | Null | Default |",
      "| --- | --- | --- | --- |",
    );
    for (const c of colsBy.get(t.oid) ?? []) {
      out.push(`| \`${c.name}\` | ${code(c.type)} | ${c.notnull ? "" : "yes"} | ${c.identity ? "identity" : c.generated ? `generated: ${code(c.def)}` : code(c.def)} |`);
    }
    const cons = consBy.get(t.oid) ?? [];
    if (cons.length) {
      const kind: Record<string, string> = { p: "primary key", f: "foreign key", u: "unique", c: "check", x: "exclusion" };
      out.push("", "| Constraint | Kind | Definition |", "| --- | --- | --- |");
      for (const c of cons) out.push(`| \`${c.name}\` | ${kind[c.type as string] ?? c.type} | ${code(c.def)} |`);
    }
    const idx = idxBy.get(t.oid) ?? [];
    if (idx.length) {
      out.push("", "Indexes:", "");
      for (const i of idx) out.push(`- ${code(String(i.def).replace(/ USING btree/, ""))}`);
    }
    const pols = polBy.get(key) ?? [];
    if (pols.length) {
      out.push("", "| Policy | Command | Roles | Using | With check |", "| --- | --- | --- | --- | --- |");
      for (const p of pols) {
        out.push(`| ${md(p.name)}${p.permissive === "RESTRICTIVE" ? " *(restrictive)*" : ""} | ${p.cmd} | ${(p.roles as string[]).join(", ")} | ${code(p.qual)} | ${code(p.with_check)} |`);
      }
    } else if (t.rls) {
      out.push("", "No policies: with RLS on, direct table access returns nothing; only SECURITY DEFINER functions read or write it.");
    }
    const trg = trgBy.get(t.oid) ?? [];
    if (trg.length) {
      out.push("", "Triggers:", "");
      for (const tr of trg) out.push(`- ${code(String(tr.def).replace(/^CREATE TRIGGER /, ""))}`);
    }
    out.push("");
  }

  out.push("## Enums", "", "| Type | Values |", "| --- | --- |");
  for (const e of enums) out.push(`| \`${e.schema}.${e.name}\` | ${(e.labels as string[]).map((l) => `\`${l}\``).join(", ")} |`);
  out.push("");

  const volatility: Record<string, string> = { i: "immutable", s: "stable", v: "volatile" };
  out.push(
    "## Functions",
    "",
    "**Callable by** shows who holds `EXECUTE` (`anon`, `authenticated`); functions callable by neither are internal",
    "(triggers, helpers used inside policies, or service-role jobs). **Definer** functions run with the owner's",
    "rights, so each one re-checks the caller itself; invoker functions stay subject to the caller's RLS.",
    "",
  );
  for (const schema of SCHEMAS) {
    const list = functions.filter((f) => f.schema === schema);
    if (!list.length) continue;
    out.push(`### \`${schema}\``, "", "| Function | Returns | Security | Callable by | Description |", "| --- | --- | --- | --- | --- |");
    for (const f of list) {
      const callers = [f.anon && "anon", f.authed && "authenticated"].filter(Boolean).join(", ") || (f.returns_trigger ? "trigger" : "internal");
      const desc = comments.get(`function:${schema}.${f.name}`) ?? "";
      out.push(`| \`${f.name}(${md(f.args)})\` | ${code(f.result)} | ${f.definer ? "definer" : "invoker"}, ${volatility[f.volatility as string]} | ${callers} | ${md(desc)} |`);
    }
    out.push("");
  }

  out.push("## Realtime publication", "", "Tables whose row changes Supabase Realtime streams (`postgres_changes`). Clients only receive rows their RLS allows.", "");
  for (const p of publication) out.push(`- \`${p.schema}.${p.name}\``);
  out.push("", "## Storage buckets and policies", "", "| Bucket | Public | Size limit | Allowed MIME types |", "| --- | --- | --- | --- |");
  for (const b of buckets) {
    const bytes = Number(b.file_size_limit ?? 0);
    const size = !bytes ? "" : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${Math.round(bytes / 1024 / 1024 * 10) / 10} MB`;
    out.push(`| \`${b.id}\` | ${b.public ? "yes" : "no"} | ${size} | ${((b.allowed_mime_types as string[] | null) ?? []).map((m) => `\`${m}\``).join(", ")} |`);
  }
  const policyTable = (schema: string, table: string) => {
    out.push("", "| Policy | Command | Roles | Using | With check |", "| --- | --- | --- | --- | --- |");
    for (const p of polBy.get(`${schema}.${table}`) ?? []) {
      out.push(`| ${md(p.name)}${p.permissive === "RESTRICTIVE" ? " *(restrictive)*" : ""} | ${p.cmd} | ${(p.roles as string[]).join(", ")} | ${code(p.qual)} | ${code(p.with_check)} |`);
    }
  };
  policyTable("storage", "objects");
  out.push("", "## Realtime channel authorization", "", "Policies on `realtime.messages` decide who may join private broadcast/presence topics (`server:<id>`, `channel:<id>`, `db:*`, …).");
  policyTable("realtime", "messages");

  out.push("", "## Foreign-key map", "", "Every foreign key between Diskarte tables (`auth.users` included). Arrows point from the referencing table.", "", "```mermaid", "erDiagram");
  const seen = new Set<string>();
  for (const t of tables) {
    for (const c of consBy.get(t.oid) ?? []) {
      if (c.type !== "f") continue;
      const target = /REFERENCES ([\w.]+)\(/.exec(String(c.def))?.[1];
      if (!target) continue;
      const to = target.includes(".") ? target : `public.${target}`;
      const from = `${t.schema}.${t.name}`;
      const edge = `${from}->${to}`;
      if (seen.has(edge)) continue;
      seen.add(edge);
      const label = String(c.def).match(/FOREIGN KEY \(([^)]+)\)/)?.[1] ?? "";
      out.push(`  ${from.replace(".", "_")} }o--|| ${to.replace(".", "_")} : "${label.replace(/"/g, "")}"`);
    }
  }
  out.push("```", "", "## Migration history", "", "Applied in filename order. The first descriptive comment line of each file:", "", "| Migration | Summary |", "| --- | --- |");
  for (const file of files) {
    const first = fs.readFileSync(path.join(MIGRATIONS, file), "utf8").split("\n").map((l) => /^--\s?(.*)$/.exec(l)?.[1]?.trim() ?? null)
      .find((l) => l && !/^[=\-─\s]*$/.test(l) && !/^Diskarte\s+[—-]?\s*$/.test(l));
    out.push(`| [\`${file}\`](../../supabase/migrations/${file}) | ${md(first ?? "")} |`);
  }
  out.push("");
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const text = await generate();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : "";
    if (current !== text) {
      console.error("docs/reference/database.md is stale: run `npm run docs:db --prefix diskarte`.");
      process.exit(1);
    }
    console.log("docs/reference/database.md is up to date.");
  } else {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, text);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${text.split("\n").length} lines).`);
  }
}
