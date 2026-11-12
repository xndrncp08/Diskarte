import type { DirectMessage } from "@/actions/social";
import type { ChatMessage } from "@/hooks/useChannelChat";
import { QUICK_REACTIONS } from "@/lib/emoji";
import type { Reaction } from "@/lib/messages";
import type { Channel } from "@/lib/servers";
import { channels, makeChannel, makeProfile, MEMBER_ID, MOD_ID, OWNER_ID, SERVER_ID } from "../fixtures/server";

// Pulse messaging fixtures (pulse-messaging.spec.ts). #chika gets a fuller transcript: read messages from
// 30 Sept, then unread ones after the fixture's read position (1 Oct, see my_unreads in database.ts).
const kapitan = makeProfile(OWNER_ID, "Kapitan");
const maria = makeProfile(MOD_ID, "Maria");
const juan = makeProfile(MEMBER_ID, "Juan");
const chika = channels[1];

function message(id: string, author: typeof maria, at: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id, channel_id: chika.id, server_id: SERVER_ID, author_id: author.id, content, author, attachments: [], reply_to_id: null, pinned: false, pinned_at: null,
    pinned_by: null, edited_at: null, thread_id: null, sticker: null, thread_reply_count: 0, thread_last_reply_at: null, created_at: at, ...extra,
  };
}

const RICH: ChatMessage[] = [
  message("r1", maria, "2026-09-30T09:00:00Z", "Who's up for ranked tonight?"),
  message("r2", maria, "2026-09-30T09:02:00Z", "We need two more for the squad."),
  message("r3", kapitan, "2026-09-30T09:05:00Z", "Count me in."),
  message("r4", juan, "2026-10-16T12:00:00Z", "@kapitan here's the plan for Saturday:"),
  message("r5", juan, "2026-10-16T12:01:00Z", "```ts\nconst squad = [\"Maria\", \"Juan\", \"Kapitan\"];\nconst start = \"8:00 PM\";\n```", { edited_at: "2026-10-16T12:02:00Z" }),
  message("r6", maria, "2026-10-16T12:03:00Z", "Sounds good! I'll bring snacks.", { reply_to_id: "r4", pinned: true, thread_reply_count: 2, thread_last_reply_at: "2026-10-16T12:10:00Z" }),
];

const reaction = (message_id: string, user_id: string, emoji: string): Reaction => ({ message_id, user_id, emoji, channel_id: chika.id, server_id: SERVER_ID, created_at: "2026-10-16T12:04:00Z" });

export const richHistory = (channelId: string) =>
  channelId === chika.id
    ? { messages: RICH, reactions: [reaction("r6", OWNER_ID, QUICK_REACTIONS[0].code), reaction("r6", MEMBER_ID, QUICK_REACTIONS[0].code), reaction("r6", MEMBER_ID, QUICK_REACTIONS[1].code)], hasMore: false }
    : null;

/** Replies in r6's thread, served from the fake `messages` table when the thread opens. */
export const THREAD_REPLIES = [
  message("t1", juan, "2026-10-16T12:05:00Z", "Chips and calamansi juice please.", { thread_id: "r6" }),
  message("t2", kapitan, "2026-10-16T12:10:00Z", "I'll bring the speaker.", { thread_id: "r6" }),
];

/** A forum channel (/tambayan/<server>/forum) with two posts. */
export const FORUM: Channel = { ...makeChannel("20000000-0000-4000-8000-000000000009", "ideas", "text", 3), type: "forum" };
export const forumHistory = {
  messages: [
    { ...message("f1", maria, "2026-10-15T08:00:00Z", "A monthly tournament with small prizes for the top three.", { title: "Monthly tournaments", thread_reply_count: 4, thread_last_reply_at: "2026-10-16T09:00:00Z", pinned: true }), channel_id: FORUM.id },
    { ...message("f2", juan, "2026-10-16T10:00:00Z", "Let's share clips of our best plays every Friday.", { title: "Friday clip night" }), channel_id: FORUM.id },
  ],
  reactions: [],
  hasMore: false,
};

// The DM with Maria (the conversation in main.tsx's SocialContext): read up to 1 Oct, so the New line shows.
export const DM_ID = "60000000-0000-4000-8000-000000000001";
const dm = (id: string, author: string, at: string, content: string, extra: Partial<DirectMessage> = {}): DirectMessage => ({
  id, conversation_id: DM_ID, author_id: author, content, attachments: [], sticker: null, reply_to_id: null, edited_at: null, created_at: at, ...extra,
});
/** Maria read up to after Kapitan's last message: "Seen". */
export const DM_READS = [
  { conversation_id: DM_ID, user_id: OWNER_ID, joined_at: "2026-09-01T00:00:00Z", last_read_at: "2026-10-01T00:00:00Z" },
  { conversation_id: DM_ID, user_id: MOD_ID, joined_at: "2026-09-01T00:00:00Z", last_read_at: "2026-10-16T13:00:00Z" },
];

/** DmView's props for /tambayan/dm/<DM_ID>. */
export const dmProps = {
  conversation: { id: DM_ID, kind: "direct" as const, name: null, owner_id: null, direct_key: null, created_at: "2026-09-01T00:00:00Z", last_message_at: "2026-10-16T12:30:00Z" },
  participants: [kapitan, maria],
  canSend: true,
  initial: {
    messages: [
      dm("d1", MOD_ID, "2026-09-30T20:00:00Z", "Thanks for the invite!"),
      dm("d2", OWNER_ID, "2026-09-30T20:05:00Z", "Anytime. See you Saturday."),
      dm("d3", MOD_ID, "2026-10-16T12:20:00Z", "Can you bring the extra controller?"),
      dm("d4", MOD_ID, "2026-10-16T12:21:00Z", "And the HDMI cable."),
      dm("d5", OWNER_ID, "2026-10-16T12:30:00Z", "Sure, both packed.", { reply_to_id: "d3" }),
    ],
    hasMore: false,
  },
};
