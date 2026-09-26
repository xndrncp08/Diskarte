import Link from "next/link";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="relative z-10 mb-6 rounded-lg" aria-label="Diskarte home">
        <DiskarteWordmark height={52} />
      </Link>
      <div className="glass-strong relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl shadow-black/50 sm:p-8">
        <div className="pointer-events-none absolute -right-6 -top-10 hidden sm:block" aria-hidden>
          <DiskarteLogo size={72} variant="mascot" />
        </div>
        {children}
      </div>
      <p className="relative z-10 mt-6 text-center font-silk text-[10px] uppercase tracking-widest text-slate-500">
        Walang Shutdown-Shutdown
      </p>
    </main>
  );
}
