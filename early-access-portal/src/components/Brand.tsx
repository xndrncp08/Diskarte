/* eslint-disable @next/next/no-img-element -- static brand SVGs exported from the main app */
import { cn } from "@/lib/utils";

/**
 * Brand art is exported from the main app's <DiskarteLogo /> / <DiskarteWordmark /> by
 * `npm run brand:assets` (repo root), so both apps always ship the same salakot mascot.
 */
export function Wordmark({ height = 40, className }: { height?: number; className?: string }) {
  return <img src="/brand/wordmark.svg" alt="Diskarte" height={height} style={{ height, width: "auto" }} className={cn("select-none", className)} />;
}

export function Mascot({ size = 160, className }: { size?: number; className?: string }) {
  return <img src="/brand/mascot.svg" alt="" width={size} height={size} className={cn("select-none", className)} aria-hidden />;
}

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return <img src="/brand/logo.svg" alt="Diskarte" width={size} height={size} className={cn("select-none", className)} />;
}
