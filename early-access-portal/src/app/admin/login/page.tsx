import type { Metadata } from "next";
import { Logo } from "@/components/Brand";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { MeshBackground } from "@/components/landing/MeshBackground";
import { FadeIn } from "@/components/motion/FadeIn";
import { safeRedirectPath } from "@/lib/security";

export const metadata: Metadata = { title: "Admin login", robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : undefined);
  const error = params.error === "not_admin" ? "Walang admin access ang account na 'to." : undefined;
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh items-center justify-center overflow-x-hidden px-4 py-10">
      <MeshBackground />
      <FadeIn className="glass-strong relative z-10 w-full max-w-sm space-y-6 rounded-3xl p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="font-pixel text-[9px] text-sun">BANTAY NG PILA</p>
            <h1 className="text-xl font-extrabold text-white">Early Access Admin</h1>
          </div>
        </div>
        <AdminLoginForm next={next} initialError={error} />
        <p className="text-xs text-slate-500">Diskarte accounts na may super_admin role lang ang makakapasok. Naka-log ang bawat review.</p>
      </FadeIn>
    </main>
  );
}
