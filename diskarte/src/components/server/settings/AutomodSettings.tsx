"use client";

import { ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAutomodAction } from "@/actions/moderation";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { AUTOMOD_CATEGORIES, AUTOMOD_CATEGORY_KEYS, parseTermList } from "@/lib/community";
import type { AutomodCategory } from "@/lib/supabase/database.types";

/** Bantay-Bayan auto-mod: master switch, built-in filter categories and custom blocked words. */
export function AutomodSettings() {
  const { server } = useServer();
  const [enabled, setEnabled] = useState(server.automod_enabled);
  const [categories, setCategories] = useState<AutomodCategory[]>(server.automod_categories);
  const [terms, setTerms] = useState(server.automod_custom_terms.join("\n"));
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function toggle(category: AutomodCategory, on: boolean) {
    setCategories((prev) => (on ? [...prev, category] : prev.filter((c) => c !== category)));
  }

  function save() {
    startTransition(async () => {
      const result = await updateAutomodAction({ serverId: server.id, enabled, categories, customTerms: parseTermList(terms) });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error ?? "Hindi na-save.");
        return;
      }
      setError(undefined);
      toast.success("Na-save ang Bantay-Bayan settings. 🛡️");
    });
  }

  return (
    <div className="space-y-5" data-testid="automod-settings">
      <div className="flex items-start gap-3 rounded-xl border border-sun/30 bg-sun/5 p-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sun" aria-hidden />
        <p className="text-sm text-slate-300">
          Awtomatikong bina-block ng <strong className="text-white">Bantay-Bayan</strong> ang messages na tumatama sa filters bago pa makita ng iba. Exempt ang
          moderators at admins, at naka-log ang bawat block sa Audit Log.
        </p>
      </div>
      <Switch checked={enabled} onChange={setEnabled} label="I-enable ang auto-mod" hint="Patayin para i-pause ang lahat ng filters." />
      <fieldset disabled={!enabled} className="space-y-3 disabled:opacity-50">
        <legend className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Filters</legend>
        {AUTOMOD_CATEGORY_KEYS.map((key) => (
          <Switch
            key={key}
            checked={categories.includes(key)}
            onChange={(on) => toggle(key, on)}
            label={AUTOMOD_CATEGORIES[key].label}
            hint={AUTOMOD_CATEGORIES[key].description}
            disabled={!enabled}
          />
        ))}
        <TextareaField
          label="Custom blocked words"
          hint="Isang salita o phrase bawat linya (o comma-separated). Hindi case-sensitive; kasama ang leetspeak tulad ng '0' para sa 'o'."
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={4}
          placeholder={"scam\nbenta account"}
          error={error}
          disabled={!enabled}
        />
      </fieldset>
      <Button onClick={save} loading={pending}>
        I-save
      </Button>
    </div>
  );
}
