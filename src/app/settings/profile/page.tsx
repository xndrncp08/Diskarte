import type { Metadata } from "next";
import { ProfileBuilder } from "@/components/profile/ProfileBuilder";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfileSettingsPage() {
  const { profile } = await requireProfile("/settings/profile");
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold text-white">My Profile</h1>
      <ProfileBuilder profile={profile} mode="settings" />
    </>
  );
}
