// Grant (or revoke) the Early Access super_admin role for an existing Diskarte account.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run admin:grant -- someone@example.com
//   … npm run admin:grant -- someone@example.com --revoke
// There is deliberately no UI for this: platform_admins can only be written with the service role.
import { createClient } from "@supabase/supabase-js";

const [email, flag] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run admin:grant -- <email> [--revoke]");
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

if (flag === "--revoke") {
  const { error } = await supabase.from("platform_admins").delete().eq("user_id", user.id);
  if (error) throw error;
  console.log(`Revoked super_admin from ${email}.`);
} else {
  const { error } = await supabase.from("platform_admins").upsert({ user_id: user.id, role: "super_admin", note: "granted via admin:grant" });
  if (error) throw error;
  console.log(`${email} is now an Early Access super_admin.`);
}
