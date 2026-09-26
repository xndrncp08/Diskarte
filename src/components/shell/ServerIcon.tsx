import { serverInitials } from "@/lib/servers";
import { cn } from "@/lib/utils";

const PALETTE = ["#FFB800", "#0038A8", "#CE1126", "#7C3AED", "#0EA5E9", "#16A34A", "#EC4899", "#F97316"];

function colorFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function ServerIcon({ server, size = 48, active = false, className }: { server: { id: string; name: string; icon_url: string | null }; size?: number; active?: boolean; className?: string }) {
  const bg = colorFor(server.id);
  const dark = bg === "#FFB800";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden font-bold transition-[border-radius] duration-200 ease-out",
        active ? "rounded-2xl" : "rounded-[50%] group-hover:rounded-2xl",
        className,
      )}
      style={{ width: size, height: size, background: server.icon_url ? "transparent" : bg, color: dark ? "#020617" : "#fff", fontSize: size * 0.34 }}
      aria-hidden
    >
      {server.icon_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={server.icon_url} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        serverInitials(server.name)
      )}
    </span>
  );
}
