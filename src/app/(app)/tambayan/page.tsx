import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Tambayan" };

export default async function TambayanHome() {
  const { profile } = await requireProfile();
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <div className="relative z-10 flex flex-col items-center gap-6">
        <DiskarteWordmark height={48} />
        <h1 className="text-2xl font-extrabold text-white">Mabuhay, {profile.display_name}!</h1>
        <ProfileCard profile={profile} />
        <div className="flex gap-2">
          <Link href="/settings/profile" className="glass inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold hover:bg-white/10">
            <Settings className="size-4" aria-hidden /> Edit profile
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-300 hover:bg-white/10">
              Log out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
