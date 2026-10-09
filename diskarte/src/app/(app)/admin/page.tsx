import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Control Center", robots: { index: false } };

/**
 * The administrative entry point (it replaced the Early Access portal's /admin review queue).
 * Super admins land on the workspace with the Control Center open; everyone else on the canvas.
 */
export default async function AdminEntry() {
  await requireSuperAdmin("/admin");
  redirect("/tambayan/admin");
}
