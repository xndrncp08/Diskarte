"use client";

import { useState } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Modal } from "@/components/ui/Modal";
import { Timestamp } from "./Timestamp";

/** "(edited)": the author and moderators can click it to see what the message said before. */
export function EditedMark({ messageId, current, editedAt, canView }: { messageId: string; current: string; editedAt: string; canView: boolean }) {
  const supabase = useSupabase();
  const [versions, setVersions] = useState<{ content: string; replaced_at: string }[] | null>(null);
  const label = <span className="shrink-0 pb-0.5 text-[10px] text-slate-500">(edited)</span>;
  if (!canView) return label;

  async function open() {
    const { data } = await supabase.from("message_edits").select("content, replaced_at").eq("message_id", messageId).order("replaced_at");
    setVersions(data ?? []);
  }

  return (
    <>
      <button type="button" onClick={() => void open()} className="shrink-0 pb-0.5 text-[10px] text-slate-500 hover:text-slate-300 hover:underline" aria-label="View edit history">
        (edited)
      </button>
      <Modal open={versions !== null} onClose={() => setVersions(null)} title="Edit history" className="max-w-lg">
        <ol className="scrollbar-thin max-h-96 space-y-2 overflow-y-auto">
          {versions?.length === 0 && <li className="text-sm text-slate-400">Earlier versions weren&apos;t kept for this message.</li>}
          {versions?.map((v, i) => (
            <li key={i} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="mb-1 text-[11px] text-slate-500">
                Replaced <Timestamp iso={v.replaced_at} />
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{v.content || "(empty)"}</p>
            </li>
          ))}
          <li className="rounded-lg border border-sun/30 bg-sun/5 px-3 py-2">
            <p className="mb-1 text-[11px] text-slate-500">
              Current · edited <Timestamp iso={editedAt} />
            </p>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{current}</p>
          </li>
        </ol>
      </Modal>
    </>
  );
}
