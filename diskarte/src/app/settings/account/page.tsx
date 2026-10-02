import type { Metadata } from "next";
import { AccountSettings, signInMethods } from "@/components/profile/AccountSettings";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Account & Sessions" };

export default async function AccountSettingsPage() {
  const { user, profile } = await requireProfile("/settings/account");
  return (
    <>
      <h1 className="mb-10 text-2xl font-extrabold text-white">Account &amp; Sessions</h1>
      <AccountSettings account={{ email: user.email ?? null, providers: signInMethods(user.app_metadata) }} username={profile.username} createdAt={profile.created_at} />
    </>
  );
}
