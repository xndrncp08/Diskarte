// Grant a platform role (or take it away) for an existing Diskarte account — how the first super
// admin is made; after that, super admins manage roles in the Control Center.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run admin:grant -- someone@example.com            (super_admin)
//   … npm run admin:grant -- someone@example.com moderator
//   … npm run admin:grant -- someone@example.com --revoke                                            (standard member)
// Reads .env.local / .env when present. platform_admins is only writable with the service role.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const [email, flag = "super_admin"] = process.argv.slice(2);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const role = flag === "--revoke" ? null : flag;
if (!email || !url || !key || (role && !["super_admin", "moderator"].includes(role))) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run admin:grant -- <email> [super_admin|moderator|--revoke]");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No Diskarte account for ${email}. Sign up in the app first.`);
  process.exit(1);
}

if (!role) {
  const { error } = await supabase.from("platform_admins").delete().eq("user_id", user.id);
  if (error) throw error;
  console.log(`${email} is a standard member again.`);
} else {
  const { error } = await supabase.from("platform_admins").upsert({ user_id: user.id, role, note: "granted via admin:grant" });
  if (error) throw error;
  console.log(`${email} is now a ${role === "super_admin" ? "Super Admin" : "Moderator"}. They see the Control Center after their next page load.`);
}
