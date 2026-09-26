import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { ProfileBuilder } from "@/components/profile/ProfileBuilder";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Buuin ang profile mo" };

export default async function OnboardingPage() {
  const { profile } = await requireProfile("/onboarding");
  if (profile.onboarded) redirect("/tambayan");

  return (
    <main className="diskarte-backdrop relative min-h-dvh px-4 py-10">
      <div className="relative z-10 mx-auto max-w-5xl">
        <DiskarteWordmark height={44} />
        <div className="mt-8 mb-8">
          <p className="font-pixel text-xs text-sun">PLAYER 1 · CREATE CHARACTER</p>
          <h1 className="mt-3 text-3xl font-extrabold text-white">Buuin ang profile mo, {profile.display_name}!</h1>
          <p className="mt-1 text-slate-400">Pumili ng salakot avatar, banner at status. Pwede mo pa ring baguhin &apos;to anytime.</p>
        </div>
        <div className="glass-strong rounded-2xl p-6 sm:p-8">
          <ProfileBuilder profile={profile} mode="onboarding" />
        </div>
      </div>
    </main>
  );
}
