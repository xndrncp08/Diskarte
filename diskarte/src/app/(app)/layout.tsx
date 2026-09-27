import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

/** Everything under (app) needs a signed-in, onboarded user. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireProfile();
  if (!profile.onboarded) redirect("/onboarding");
  return children;
}
