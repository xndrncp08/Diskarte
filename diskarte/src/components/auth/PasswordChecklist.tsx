import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/profile";
import { cn } from "@/lib/utils";

/** Live password-policy checklist (the same rules the server enforces). */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]" aria-label="Password requirements" data-testid="password-rules">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.label} className={cn("flex items-center gap-1", ok ? "text-signal-green" : "text-slate-400")}>
            {ok ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
            <span>{rule.label}</span>
            <span className="sr-only">{ok ? "(met)" : "(missing)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
