import type { DirectMessage } from "@/actions/social";
import type { MessageAuthor } from "./messages";
import type { ChatMessage } from "@/hooks/useChannelChat";

/** Shared rendering shape; DMs carry no channel attachments, pins or threads. */
export function dmToChat(dm: DirectMessage, author: MessageAuthor | null): ChatMessage {
  return { id: dm.id, channel_id: dm.conversation_id, server_id: "", author_id: dm.author_id,
    content: dm.content, attachments: [], reply_to_id: dm.reply_to_id, pinned: false,
    pinned_at: null, pinned_by: null, edited_at: dm.edited_at, thread_id: null, sticker: dm.sticker,
    thread_reply_count: 0, thread_last_reply_at: null, created_at: dm.created_at, author };
}
