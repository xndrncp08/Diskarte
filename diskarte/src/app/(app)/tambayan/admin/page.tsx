import type { Metadata } from "next";
import { AdminRoute } from "@/components/admin/AdminRoute";
import { requireSuperAdmin } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export const metadata: Metadata = { title: "Control Center", robots: { index: false } };

/** Verified on the server before anything renders: non-admins go straight back to the canvas. */
export default async function AdminPage() {
  await requireSuperAdmin("/tambayan/admin");
  const { profile } = await requireProfile("/tambayan/admin");
  const servers = await getMyServers(profile.id);
  return <AdminRoute servers={servers} />;
}
