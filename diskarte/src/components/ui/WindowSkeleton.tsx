/** Placeholder while a floating window's code is still downloading (window bodies load on first open). */
export function WindowSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="space-y-3 p-6" role="status" aria-busy="true" data-testid="window-skeleton">
      <span className="sr-only">{label}…</span>
      <div className="h-6 w-1/3 animate-pulse rounded-lg bg-white/10" />
      <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
