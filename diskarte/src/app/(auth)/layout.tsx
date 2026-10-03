import Link from "next/link";
import { AuthEntrance } from "@/components/motion/AuthEntrance";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main>
      <AuthEntrance tagline="Walang Shutdown-Shutdown">
        <div className="relative rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset,0_30px_60px_-30px_rgb(0_0_0/0.8),0_0_80px_-40px_rgb(255_184_0/0.35)] backdrop-blur-2xl sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/" className="inline-flex items-center rounded-md px-2 text-slate-400 hover:text-sun pointer-coarse:min-h-11" aria-label="Diskarte home">
            Back to home
          </Link>
        </p>
      </AuthEntrance>
    </main>
  );
}
