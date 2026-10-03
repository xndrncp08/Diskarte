import { SmartImage } from "@/components/ui/SmartImage";
import { serverInitials } from "@/lib/servers";
import { cn } from "@/lib/utils";

// Every colour clears WCAG AA (4.5:1) for its initials: dark text on gold, white on the rest.
const PALETTE = ["#FFB800", "#0038A8", "#CE1126", "#7C3AED", "#0369A1", "#15803D", "#BE185D", "#C2410C"];

function colorFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function ServerIcon({
  server,
  size = 48,
  active = false,
  className,
}: {
  server: { id: string; name: string; icon_url: string | null; is_system?: boolean };
  size?: number;
  active?: boolean;
  className?: string;
}) {
  // Diskarte HQ gets its own 8-bit "HQ" mark (the mascot is already the Home button) unless an admin uploads an icon.
  const official = server.is_system && !server.icon_url;
  const bg = official ? "#0F172A" : colorFor(server.id);
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
        <SmartImage src={server.icon_url} alt="" width={size} height={size} className="size-full object-cover" />
      ) : official ? (
        <span className="font-pixel text-sun" style={{ fontSize: size * 0.24 }}>
          HQ
        </span>
      ) : (
        serverInitials(server.name)
      )}
    </span>
  );
}
