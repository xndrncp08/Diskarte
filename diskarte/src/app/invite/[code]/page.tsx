import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { JoinInviteButton } from "@/components/server/JoinInviteButton";
import { ServerIcon } from "@/components/shell/ServerIcon";
import { getSessionUser } from "@/lib/auth";
import { tryGetPublicEnv } from "@/lib/env";
import { parseInviteInput } from "@/lib/servers";
import { createClient } from "@/lib/supabase/server";

async function loadInvite(rawCode: string) {
  const code = parseInviteInput(rawCode);
  if (!code || !tryGetPublicEnv()) return { code, invite: null };
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invite", { p_code: code });
  return { code, invite: data?.[0] ?? null };
}

export async function generateMetadata({ params }: PageProps<"/invite/[code]">): Promise<Metadata> {
  const { invite } = await loadInvite((await params).code);
  return invite
    ? { title: `Join ${invite.name}`, description: invite.description || `You're invited to ${invite.name} on Diskarte.` }
    : { title: "Invalid invite" };
}

export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code, invite } = await loadInvite((await params).code);
  const user = await getSessionUser();

  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="relative z-10 mb-6" aria-label="Diskarte home">
        <DiskarteWordmark height={44} />
      </Link>
      <div className="glass-strong relative z-10 w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl shadow-black/50">
        {invite && code ? (
          <>
            <p className="font-pixel text-[9px] text-sun">YOU&apos;RE INVITED TO</p>
            <div className="my-4 flex justify-center">
              <ServerIcon server={{ id: invite.server_id, name: invite.name, icon_url: invite.icon_url }} size={80} active />
            </div>
            <h1 className="text-2xl font-extrabold text-white">{invite.name}</h1>
            {invite.description && <p className="mt-1 text-sm text-slate-400">{invite.description}</p>}
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-300">
              <Users className="size-4" aria-hidden /> {Number(invite.member_count)} {Number(invite.member_count) === 1 ? "member" : "members"}
            </p>
            <div className="mt-6">
              {!user ? (
                <div className="grid gap-2">
                  <Link href={`/signup?next=${encodeURIComponent(`/invite/${code}`)}`} className="flex h-11 items-center justify-center rounded-lg bg-sun font-semibold text-abyss">
                    Create an account to join
                  </Link>
                  <Link href={`/login?next=${encodeURIComponent(`/invite/${code}`)}`} className="flex h-11 items-center justify-center rounded-lg border border-white/10 font-semibold text-white hover:bg-white/10">
                    I already have an account
                  </Link>
                </div>
              ) : invite.already_member ? (
                <Link href={`/tambayan/${invite.server_id}`} className="flex h-11 items-center justify-center rounded-lg bg-sun font-semibold text-abyss">
                  You&apos;re already a member — open it
                </Link>
              ) : (
                <JoinInviteButton code={code} />
              )}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-extrabold text-white">Invalid or expired invite</h1>
            <p className="mt-2 text-sm text-slate-400">Ask your friend for a new link.</p>
            <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-semibold text-sun hover:underline">
              Back to Diskarte
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
