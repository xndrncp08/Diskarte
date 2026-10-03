// Types mirroring supabase/migrations/*.sql (schema, security hardening, community).
// Regenerate with `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "member" | "moderator" | "admin";
export type ChannelType = "text" | "voice";
export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";
export type AutomodCategory = "spam" | "phishing" | "hate" | "explicit";
export type BadgeKind = "booster" | "lodi_supporter" | "gcash_contributor";
export type LfgStatus = "open" | "full" | "closed";
export type FriendshipStatus = "pending" | "accepted";
export type DmKind = "direct" | "group";
export type RingKind = "dm" | "voice";
export type RingStatus = "ringing" | "accepted" | "declined" | "missed" | "cancelled";

/** Row/Insert pair helper for the community tables (Update = Partial<Insert>). */
interface TableDef<Row, Insert> {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
}

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_preset: string;
          avatar_url: string | null;
          banner_preset: string;
          banner_url: string | null;
          bio: string;
          status: PresenceStatus;
          custom_status: string | null;
          custom_status_emoji: string | null;
          onboarded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          avatar_preset?: string;
          avatar_url?: string | null;
          banner_preset?: string;
          banner_url?: string | null;
          bio?: string;
          status?: PresenceStatus;
          custom_status?: string | null;
          custom_status_emoji?: string | null;
          onboarded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      servers: {
        Row: {
          id: string;
          name: string;
          description: string;
          icon_url: string | null;
          /** null only for the system server (Diskarte HQ), which belongs to nobody. */
          owner_id: string | null;
          /** The global "super server" every account belongs to. */
          is_system: boolean;
          invite_code: string;
          automod_enabled: boolean;
          automod_categories: AutomodCategory[];
          automod_custom_terms: string[];
          gcash_number: string | null;
          maya_number: string | null;
          support_note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          icon_url?: string | null;
          owner_id: string | null;
          is_system?: boolean;
          invite_code?: string;
          automod_enabled?: boolean;
          automod_categories?: AutomodCategory[];
          automod_custom_terms?: string[];
          gcash_number?: string | null;
          maya_number?: string | null;
          support_note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["servers"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "servers_owner_id_fkey"; columns: ["owner_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      members: {
        Row: {
          server_id: string;
          user_id: string;
          role: MemberRole;
          nickname: string | null;
          joined_at: string;
        };
        Insert: {
          server_id: string;
          user_id: string;
          role?: MemberRole;
          nickname?: string | null;
          joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["members"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "members_server_id_fkey"; columns: ["server_id"]; isOneToOne: false; referencedRelation: "servers"; referencedColumns: ["id"] },
          { foreignKeyName: "members_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      channels: {
        Row: {
          id: string;
          server_id: string;
          name: string;
          type: ChannelType;
          category: string;
          topic: string;
          position: number;
          slowmode_seconds: number;
          requires_verification: boolean;
          /** Only server admins (in Diskarte HQ: the creators) can post. */
          read_only: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          server_id: string;
          name: string;
          type?: ChannelType;
          category?: string;
          topic?: string;
          position?: number;
          slowmode_seconds?: number;
          requires_verification?: boolean;
          read_only?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "channels_server_id_fkey"; columns: ["server_id"]; isOneToOne: false; referencedRelation: "servers"; referencedColumns: ["id"] },
        ];
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          server_id: string;
          author_id: string | null;
          content: string;
          attachments: Json;
          reply_to_id: string | null;
          pinned: boolean;
          pinned_at: string | null;
          pinned_by: string | null;
          edited_at: string | null;
          thread_id: string | null;
          sticker: string | null;
          thread_reply_count: number;
          thread_last_reply_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          server_id?: string;
          author_id?: string | null;
          content?: string;
          attachments?: Json;
          reply_to_id?: string | null;
          pinned?: boolean;
          pinned_at?: string | null;
          pinned_by?: string | null;
          edited_at?: string | null;
          thread_id?: string | null;
          sticker?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "messages_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_channel_id_fkey"; columns: ["channel_id"]; isOneToOne: false; referencedRelation: "channels"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_server_id_fkey"; columns: ["server_id"]; isOneToOne: false; referencedRelation: "servers"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_reply_to_id_fkey"; columns: ["reply_to_id"]; isOneToOne: false; referencedRelation: "messages"; referencedColumns: ["id"] },
        ];
      };
      reactions: {
        Row: {
          message_id: string;
          user_id: string;
          emoji: string;
          channel_id: string;
          server_id: string;
          created_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          emoji: string;
          channel_id?: string;
          server_id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reactions"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "reactions_message_id_fkey"; columns: ["message_id"]; isOneToOne: false; referencedRelation: "messages"; referencedColumns: ["id"] },
          { foreignKeyName: "reactions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      audit_logs: TableDef<
        { id: number; server_id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; metadata: Json; created_at: string },
        never
      >;
      server_bans: TableDef<{ server_id: string; user_id: string; banned_by: string | null; reason: string; created_at: string }, never>;
      server_badges: TableDef<
        { server_id: string; user_id: string; badge: BadgeKind; granted_by: string | null; created_at: string },
        { server_id: string; user_id: string; badge: BadgeKind; granted_by?: string | null; created_at?: string }
      >;
      lfg_beacons: TableDef<
        {
          id: string;
          server_id: string;
          author_id: string;
          game: string;
          description: string;
          party_size: number;
          voice_channel_id: string | null;
          status: LfgStatus;
          expires_at: string;
          created_at: string;
        },
        never
      >;
      lfg_party_members: TableDef<{ beacon_id: string; server_id: string; user_id: string; joined_at: string }, never>;
      soundboard_clips: TableDef<
        { id: string; server_id: string; name: string; emoji: string; storage_path: string; created_by: string | null; created_at: string },
        { id?: string; server_id: string; name: string; emoji?: string; storage_path: string; created_by?: string | null; created_at?: string }
      >;
      friendships: TableDef<
        { user_low: string; user_high: string; requested_by: string; status: FriendshipStatus; created_at: string; accepted_at: string | null },
        never
      >;
      user_blocks: TableDef<{ blocker_id: string; blocked_id: string; created_at: string }, never>;
      dm_conversations: TableDef<
        { id: string; kind: DmKind; name: string | null; owner_id: string | null; direct_key: string | null; created_at: string; last_message_at: string },
        never
      >;
      dm_participants: TableDef<{ conversation_id: string; user_id: string; joined_at: string; last_read_at: string }, never>;
      direct_messages: TableDef<
        {
          id: string;
          conversation_id: string;
          author_id: string | null;
          content: string;
          sticker: string | null;
          reply_to_id: string | null;
          edited_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          conversation_id: string;
          author_id?: string | null;
          content?: string;
          sticker?: string | null;
          reply_to_id?: string | null;
          edited_at?: string | null;
          created_at?: string;
        }
      >;
      call_rings: TableDef<
        {
          id: string;
          kind: RingKind;
          caller_id: string;
          callee_id: string;
          conversation_id: string | null;
          server_id: string | null;
          channel_id: string | null;
          video: boolean;
          status: RingStatus;
          created_at: string;
          expires_at: string;
          responded_at: string | null;
        },
        never
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_server: { Args: { p_name: string; p_description?: string; p_icon_url?: string | null }; Returns: string };
      get_invite: {
        Args: { p_code: string };
        Returns: { server_id: string; name: string; description: string; icon_url: string | null; member_count: number; already_member: boolean }[];
      };
      join_server: { Args: { p_code: string }; Returns: string };
      regenerate_invite: { Args: { p_server_id: string }; Returns: string };
      username_available: { Args: { p_username: string }; Returns: boolean };
      is_server_member: { Args: { p_server_id: string }; Returns: boolean };
      has_server_role: { Args: { p_server_id: string; p_min: MemberRole }; Returns: boolean };
      server_role: { Args: { p_server_id: string }; Returns: MemberRole };
      is_verified_user: { Args: Record<string, never>; Returns: boolean };
      ban_member: { Args: { p_server_id: string; p_user_id: string; p_reason?: string }; Returns: undefined };
      account_deletion_files: { Args: Record<string, never>; Returns: { bucket: string; path: string }[] };
      delete_my_account: { Args: { p_confirm: string }; Returns: undefined };
      ring_call: { Args: { p_kind: RingKind; p_target: string; p_callee?: string | null; p_video?: boolean }; Returns: string[] };
      respond_ring: { Args: { p_ring: string; p_accept: boolean }; Returns: RingStatus };
      cancel_rings: { Args: { p_target: string }; Returns: undefined };
      unban_member: { Args: { p_server_id: string; p_user_id: string }; Returns: undefined };
      create_lfg: {
        Args: { p_server_id: string; p_game: string; p_description?: string; p_party_size?: number; p_voice_channel_id?: string | null; p_duration_minutes?: number };
        Returns: string;
      };
      join_lfg: { Args: { p_beacon_id: string }; Returns: string | null };
      leave_lfg: { Args: { p_beacon_id: string }; Returns: undefined };
      close_lfg: { Args: { p_beacon_id: string }; Returns: undefined };
      send_friend_request: { Args: { p_username: string }; Returns: FriendshipStatus };
      respond_friend_request: { Args: { p_user_id: string; p_accept: boolean }; Returns: undefined };
      remove_friend: { Args: { p_user_id: string }; Returns: undefined };
      block_user: { Args: { p_user_id: string }; Returns: undefined };
      unblock_user: { Args: { p_user_id: string }; Returns: undefined };
      open_dm: { Args: { p_user_id: string }; Returns: string };
      create_group_dm: { Args: { p_user_ids: string[]; p_name?: string | null }; Returns: string };
      add_to_group_dm: { Args: { p_conversation_id: string; p_user_id: string }; Returns: undefined };
      rename_group_dm: { Args: { p_conversation_id: string; p_name: string }; Returns: undefined };
      leave_dm: { Args: { p_conversation_id: string }; Returns: undefined };
      mark_dm_read: { Args: { p_conversation_id: string }; Returns: undefined };
    };
    Enums: {
      member_role: MemberRole;
      channel_type: ChannelType;
      presence_status: PresenceStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

type PublicTables = Database["public"]["Tables"];
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"];
