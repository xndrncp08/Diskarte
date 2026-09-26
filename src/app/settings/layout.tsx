import Link from "next/link";
import { X } from "lucide-react";
import { redirect } from "next/navigation";
import { SettingsNav } from "@/components/profile/SettingsNav";
import { requireProfile } from "@/lib/auth";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const { profile } = await requireProfile("/settings/profile");
  if (!profile.onboarded) redirect("/onboarding");

  return (
    <div className="diskarte-backdrop relative flex min-h-dvh">
      <aside className="relative z-10 hidden w-60 shrink-0 border-r border-white/5 bg-black/30 px-3 py-10 md:block">
        <p className="mb-2 px-3 font-silk text-[10px] uppercase tracking-widest text-slate-500">User settings</p>
        <SettingsNav />
      </aside>
      <main className="relative z-10 flex-1 px-4 py-10 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 md:hidden">
            <SettingsNav horizontal />
          </div>
          {children}
        </div>
      </main>
      <Link
        href="/tambayan"
        aria-label="Close settings"
        className="fixed right-5 top-5 z-20 flex size-10 items-center justify-center rounded-full border border-white/20 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
