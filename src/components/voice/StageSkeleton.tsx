/** Placeholder while the LiveKit call UI chunk loads: pulsing tiles + a control bar. */
export function StageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4" aria-busy="true" aria-label="Loading call" data-testid="stage-skeleton">
      <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="scanlines aspect-video w-full max-w-md animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
      <div className="mx-auto h-[4.5rem] w-80 animate-pulse rounded-3xl bg-white/5" />
    </div>
  );
}
