import Link from "next/link";
import { Mascot } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Mascot size={120} className="relative z-10" />
      <p className="relative z-10 font-pixel text-[10px] text-sun">404 · WALANG GANITONG PAGE</p>
      <Link href="/" className="relative z-10 rounded-xl bg-sun px-4 py-2 font-bold text-abyss">
        Bumalik sa waitlist
      </Link>
    </main>
  );
}
