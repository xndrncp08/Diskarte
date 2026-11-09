"use client";

import { AlarmClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";
import { useOptionalSupabase, useSupabase } from "@/components/providers/RuntimeConfig";
import { Modal } from "@/components/ui/Modal";
import { previewText } from "@/lib/messages";
import { desktopNotify } from "@/lib/notify-prefs";
import { REMINDER_OPTIONS, REMINDER_POLL_MS } from "@/lib/reminders";

/** "Remind me…": saves the message (if it isn't already) with a reminder time. */
export function ReminderDialog({ messageId, onClose, onSaved }: { messageId: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const supabase = useSupabase();

  async function pick(at: Date) {
    if (!messageId) return;
    const remind_at = at.toISOString();
    // Insert, or (already saved) just set the time: only remind_at is updatable.
    const { error } = await supabase.from("saved_messages").insert({ message_id: messageId, remind_at });
    const failed = error?.code === "23505" ? (await supabase.from("saved_messages").update({ remind_at }).eq("message_id", messageId)).error : error;
    if (failed) return void toast.error("Couldn't set the reminder.");
    onSaved(messageId);
    toast(`Reminder set for ${at.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}.`);
    onClose();
  }

  return (
    <Modal open={messageId !== null} onClose={onClose} title="Remind me" description="You'll get a reminder here in Diskarte. The message stays in Saved.">
      <ul className="space-y-1">
        {REMINDER_OPTIONS.map((option) => (
          <li key={option.id}>
            <button type="button" onClick={() => void pick(option.at(new Date()))} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-white/10">
              <AlarmClock className="size-4 text-sun" aria-hidden /> {option.label}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * Delivers due reminders while the app is open (shell-wide): a toast with a jump link, a desktop
 * notification when enabled, then clears remind_at so it fires once. Reminders that came due while
 * the app was closed show the next time it opens; there is no push delivery for them.
 */
export function ReminderWatcher() {
  const supabase = useOptionalSupabase();
  const router = useRouter();

  const check = useEffectEvent(async () => {
    if (!supabase) return;
    const { data: due, error } = await supabase.from("saved_messages").select("message_id").lte("remind_at", new Date().toISOString()).limit(10);
    if (error || !due?.length) return;
    const ids = due.map((d) => d.message_id);
    // Clear first so a second tab doesn't announce the same reminder.
    const { data: cleared } = await supabase.from("saved_messages").update({ remind_at: null }).in("message_id", ids).not("remind_at", "is", null).select("message_id");
    const mine = (cleared ?? []).map((c) => c.message_id);
    if (!mine.length) return;
    const { data: messages } = await supabase.from("messages").select("id, content, server_id, channel_id").in("id", mine);
    for (const m of messages ?? []) {
      const href = `/tambayan/${m.server_id}/${m.channel_id}?message=${m.id}`;
      const body = previewText(m.content || "(attachment)", 140);
      toast("Reminder", { description: body, icon: <AlarmClock className="size-4" aria-hidden />, duration: 15_000, action: { label: "Open", onClick: () => router.push(href) } });
      desktopNotify({ title: "Diskarte reminder", body, tag: `reminder:${m.id}`, href, open: (to) => router.push(to) });
    }
  });

  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), REMINDER_POLL_MS);
    const resume = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return null;
}
