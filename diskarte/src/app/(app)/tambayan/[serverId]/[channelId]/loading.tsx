const ROWS = [
  ["w-24", "w-3/4"],
  ["w-20", "w-1/2"],
  ["w-28", "w-2/3"],
];

/**
 * Shown the instant a channel is clicked while its messages load (it also lets <Link> prefetch everything up
 * to here). It fades in after a beat, so fast loads go straight to the channel without a flash.
 */
export default function ChannelLoading() {
  return (
    <div className="fade-delayed flex min-w-0 flex-1 flex-col" role="status" aria-label="Loading channel">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 bg-black/20 px-3">
        <span className="size-5 rounded bg-white/10" />
        <span className="h-4 w-32 rounded bg-white/10" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-5 p-4">
        {ROWS.map(([name, line], i) => (
          <div key={i} className="flex animate-pulse gap-3">
            <span className="size-10 shrink-0 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2 pt-1">
              <span className={`block h-3 rounded bg-white/10 ${name}`} />
              <span className={`block h-3 rounded bg-white/5 ${line}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
