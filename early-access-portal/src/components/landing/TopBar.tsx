import { AppStatus } from "@/components/AppStatus";
import { Wordmark } from "@/components/Brand";

/** Brand, live app status and the way into the Diskarte app for people already approved. */
export function TopBar({ appUrl }: { appUrl: string }) {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-5 sm:px-6 2xl:max-w-7xl">
      <Wordmark height={36} className="shrink-0" />
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden sm:inline-flex">
          <AppStatus appUrl={appUrl} />
        </span>
        <a
          href={`${appUrl}/login?from=early-access`}
          className="inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-white/5 px-3.5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
        >
          Mag-login
        </a>
      </div>
    </header>
  );
}
