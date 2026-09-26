import { signInWithProviderAction } from "@/app/(auth)/actions";
import { DiscordMark, GithubMark, GoogleMark } from "@/components/icons/BrandIcons";
import type { OAuthProvider } from "@/lib/profile";

const META: Record<OAuthProvider, { label: string; Icon: (p: { className?: string }) => React.ReactElement }> = {
  github: { label: "GitHub", Icon: GithubMark },
  google: { label: "Google", Icon: GoogleMark },
  discord: { label: "Discord (habang buhay pa)", Icon: DiscordMark },
};

export function OAuthButtons({ providers, next }: { providers: OAuthProvider[]; next: string }) {
  if (providers.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-white/10" />
        <span className="font-silk uppercase tracking-wider">o kaya</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="grid gap-2">
        {providers.map((provider) => {
          const { label, Icon } = META[provider];
          return (
            <form key={provider} action={signInWithProviderAction}>
              <input type="hidden" name="provider" value={provider} />
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                className="flex h-10 w-full items-center justify-center gap-2 pointer-coarse:h-11 rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
              >
                <Icon className="size-4" />
                Continue with {label}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
