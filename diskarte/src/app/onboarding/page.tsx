import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { ProfileBuilder } from "@/components/profile/ProfileBuilder";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage() {
  const { profile } = await requireProfile("/onboarding");
  if (profile.onboarded) redirect("/tambayan");

  return (
    <main className="diskarte-backdrop relative min-h-dvh px-4 py-10">
      <div className="relative z-10 mx-auto max-w-5xl">
        <DiskarteWordmark height={44} />
        <div className="mt-8 mb-8">
          <p className="font-pixel text-xs text-sun">PLAYER 1 · CREATE CHARACTER</p>
          <h1 className="mt-3 text-3xl font-extrabold text-white">Set up your profile, {profile.display_name}!</h1>
          <p className="mt-1 text-slate-400">Pick a salakot avatar, banner and status. You can change these anytime.</p>
        </div>
        <div className="glass-strong rounded-2xl p-6 sm:p-8">
          <ProfileBuilder profile={profile} mode="onboarding" />
        </div>
      </div>
    </main>
  );
}
