import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { loadDashboard } from "@/lib/data";
import { listQuerySchema } from "@/lib/schema";
import { createClient, getSuperAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review queue", robots: { index: false } };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const supabase = await createClient();
  // Defence in depth: proxy.ts already checked, but pages must never trust that alone.
  const admin = await getSuperAdmin(supabase);
  if (!admin) redirect("/admin/login");
  const params = await searchParams;
  const query = listQuerySchema.parse({ status: params.status, q: params.q ?? "", page: params.page });
  const data = await loadDashboard(supabase, query);
  return <AdminDashboard data={data} query={query} adminEmail={admin.email ?? ""} />;
}
