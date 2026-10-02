import Link from "next/link";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";

export default function NotFound() {
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="relative z-10 flex flex-col items-center gap-4">
        <DiskarteLogo size={96} variant="mascot" />
        <p className="font-pixel text-xs text-sun">404 · GAME OVER</p>
        <h1 className="text-2xl font-extrabold text-white">Page not found</h1>
        <p className="max-w-sm text-slate-400">That page doesn&apos;t exist, or you&apos;re not a member of this server.</p>
        <Link href="/tambayan" className="rounded-lg bg-sun px-4 py-2 font-semibold text-abyss">
          Back to Diskarte
        </Link>
      </div>
    </main>
  );
}
