import { CircleHelp } from "lucide-react";
import { HELP, type HelpTopic } from "@/lib/docs/help";
import { cn } from "@/lib/utils";

/** A quiet link to the matching Help Center article. Opens a new tab so calls and drafts are untouched. */
export function HelpLink({ topic, label = "Help", className }: { topic: HelpTopic; label?: string; className?: string }) {
  return (
    <a
      href={HELP[topic]}
      target="_blank"
      rel="noopener"
      className={cn("inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs text-slate-400 transition-colors hover:text-white focus-visible:text-white pointer-coarse:min-h-11", className)}
    >
      <CircleHelp className="size-3.5" aria-hidden />
      {label}
      <span className="sr-only"> (opens the Help Center in a new tab)</span>
    </a>
  );
}
