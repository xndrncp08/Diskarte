// Types mirroring supabase/migrations/*.sql (schema, security hardening, community, admin control center).
// Regenerate with `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "member" | "moderator" | "admin";
export type ChannelType = "text" | "voice" | "forum";
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
      workspace_assets: TableDef<{ channel_id: string; kind: "resources" | "whiteboard"; content: Json; revision: number; updated_by: string | null; updated_at: string }, never>;
      account_state: TableDef<{ user_id: string; key: string; value: Json; revision: number; updated_at: string }, never>;
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
          /** Listed in Explore (admins opt in). Absent before the discovery migration. */
          is_public?: boolean;
          category?: string;
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
          is_public?: boolean;
          category?: string;
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
          /** Timed out (can't send, react or join voice) until then. Only timeout_member() sets it. */
          timeout_until?: string | null;
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
          /** Only admins and people or roles they let in (channel_access) can see it. */
          is_private: boolean;
          /** When the channel last got a (non-thread) message. */
          last_message_at?: string | null;
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
          is_private?: boolean;
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
          /** Set by create_poll(); the poll itself is in public.polls. (Absent before that migration.) */
          has_poll?: boolean;
          /** A forum post's title (top-level messages in forum channels only). */
          title?: string | null;
          /** @everyone/@here from a moderator. */
          mentions_everyone?: boolean;
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
          title?: string | null;
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
      server_roles: TableDef<
        { id: string; server_id: string; name: string; color: string; position: number; created_at: string },
        { server_id: string; name: string; color?: string; position?: number }
      >;
      member_roles: TableDef<{ server_id: string; user_id: string; role_id: string; created_at: string }, { server_id: string; user_id: string; role_id: string }>;
      channel_access: TableDef<
        { id: string; channel_id: string; server_id: string; user_id: string | null; role_id: string | null; created_at: string },
        { channel_id: string; server_id: string; user_id?: string | null; role_id?: string | null }
      >;
      polls: TableDef<{ message_id: string; channel_id: string; options: string[]; multi: boolean; ends_at: string; created_at: string }, never>;
      poll_votes: TableDef<{ message_id: string; channel_id: string; user_id: string; option: number; created_at: string }, never>;
      message_edits: TableDef<{ id: number; message_id: string; server_id: string; author_id: string | null; content: string; replaced_at: string }, never>;
      member_warnings: TableDef<{ id: string; server_id: string; user_id: string; moderator_id: string | null; reason: string; acknowledged_at: string | null; created_at: string }, never>;
      privacy_settings: TableDef<{ user_id: string; friend_requests_from: string; updated_at: string }, { user_id?: string; friend_requests_from: string; updated_at?: string }>;
      server_invites: TableDef<{ code: string; server_id: string; created_by: string | null; max_uses: number | null; uses: number; expires_at: string | null; created_at: string }, never>;
      server_events: TableDef<
        { id: string; server_id: string; channel_id: string | null; location: string | null; name: string; description: string; starts_at: string; ends_at: string | null; created_by: string | null; created_at: string; capacity?: number | null; rsvp_count?: number },
        { id?: string; server_id: string; channel_id?: string | null; location?: string | null; name: string; description?: string; starts_at: string; ends_at?: string | null; created_by?: string | null; capacity?: number | null }
      >;
      event_rsvps: TableDef<{ event_id: string; server_id: string; user_id: string; created_at: string }, { event_id: string; server_id: string; user_id?: string }>;
      server_emojis: TableDef<{ id: string; server_id: string; name: string; path: string; created_by: string | null; created_at: string }, { id?: string; server_id: string; name: string; path: string; created_by?: string | null }>;
      saved_messages: TableDef<{ user_id: string; message_id: string; saved_at: string }, { user_id?: string; message_id: string; saved_at?: string }>;
      workspace_documents: TableDef<{ id: string; server_id: string; channel_id: string; kind: "note" | "board" | "focus"; title: string; content: Json; revision: number; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string }, never>;
      channel_reads: TableDef<{ user_id: string; channel_id: string; last_read_at: string }, never>;
      message_mentions: TableDef<{ message_id: string; user_id: string; channel_id: string; server_id: string; created_at: string }, never>;
      user_notes: TableDef<{ owner_id: string; target_id: string; note: string; updated_at: string }, { owner_id?: string; target_id: string; note: string; updated_at?: string }>;
      friend_nicknames: TableDef<{ owner_id: string; target_id: string; nickname: string }, { owner_id?: string; target_id: string; nickname: string }>;
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
          /** Absent on projects which have not applied the DM-media migration yet. */
          attachments?: Json;
          invite_server_id?: string | null;
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
          attachments?: Json;
          sticker?: string | null;
          invite_server_id?: string | null;
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
      platform_admins: TableDef<{ user_id: string; role: "super_admin" | "moderator"; note: string; granted_at: string; granted_by: string | null }, never>;
      admin_audit_logs: TableDef<
        { id: string; actor_id: string | null; action: string; target_user_id: string | null; details: Json; created_at: string },
        never
      >;
      account_controls: TableDef<
        {
          user_id: string;
          banned_until: string | null;
          ban_reason: string | null;
          banned_by: string | null;
          sessions_revoked_at: string | null;
          status_override: Json | null;
          status_override_at: string | null;
          updated_at: string;
        },
        never
      >;
      user_devices: TableDef<
        {
          user_id: string;
          device_id: string;
          fingerprint: string;
          label: string;
          status: PresenceStatus;
          custom_status: string | null;
          voice_channel_id: string | null;
          first_seen_at: string;
          last_seen_at: string;
        },
        never
      >;
      system_broadcasts: TableDef<
        {
          id: string;
          author_id: string | null;
          title: string;
          body: string;
          tone: "info" | "success" | "warning" | "critical";
          targets: string[];
          message_ids: string[];
          sticky: boolean;
          sticky_until: string | null;
          retracted_at: string | null;
          created_at: string;
        },
        never
      >;
      problem_reports: TableDef<
        {
          id: string;
          reporter_id: string;
          category: "bug" | "slow" | "account" | "other";
          description: string;
          page_url: string | null;
          user_agent: string | null;
          status: "open" | "sent" | "resolved" | "dismissed";
          issue_url: string | null;
          created_at: string;
          updated_at: string;
        },
        { category: "bug" | "slow" | "account" | "other"; description: string; page_url?: string | null; user_agent?: string | null }
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
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      my_platform_role: { Args: Record<string, never>; Returns: string };
      is_platform_banned: { Args: { p_user?: string | null }; Returns: boolean };
      heartbeat_device: {
        Args: { p_device_id: string; p_fingerprint: string; p_label: string; p_status: PresenceStatus; p_custom_status?: string | null; p_voice_channel_id?: string | null };
        Returns: Json;
      };
      forget_device: { Args: { p_device_id: string }; Returns: undefined };
      admin_overview: { Args: Record<string, never>; Returns: Json };
      admin_list_users: {
        Args: { p_query?: string | null; p_limit?: number };
        Returns: {
          id: string;
          username: string;
          display_name: string;
          avatar_preset: string;
          avatar_url: string | null;
          status: PresenceStatus;
          custom_status: string | null;
          email: string | null;
          created_at: string;
          last_sign_in_at: string | null;
          role: string;
          banned_until: string | null;
          ban_reason: string | null;
          sessions: number;
          last_seen_at: string | null;
          devices: Json;
        }[];
      };
      admin_channel_labels: { Args: { p_ids: string[] }; Returns: { id: string; name: string; server_id: string; server_name: string }[] };
      admin_set_role: { Args: { p_user: string; p_role: string }; Returns: undefined };
      admin_set_status: { Args: { p_user: string; p_status: PresenceStatus; p_custom_status?: string | null }; Returns: undefined };
      admin_revoke_sessions: { Args: { p_user: string }; Returns: number };
      admin_ban_user: { Args: { p_user: string; p_hours?: number | null; p_reason?: string | null }; Returns: string };
      admin_unban_user: { Args: { p_user: string }; Returns: undefined };
      admin_dispatch_broadcast: {
        Args: { p_title: string; p_body: string; p_tone?: string; p_targets?: string[]; p_sticky?: boolean; p_sticky_hours?: number | null };
        Returns: string;
      };
      admin_retract_broadcast: { Args: { p_broadcast: string }; Returns: undefined };
      admin_set_report_status: { Args: { p_report: string; p_status: string; p_issue_url?: string | null }; Returns: undefined };
      record_site_visit: { Args: { p_visitor: string }; Returns: undefined };
      my_unreads: {
        Args: Record<string, never>;
        Returns: { channel_id: string; server_id: string; last_message_at: string | null; read_at: string; mentions: number }[];
      };
      mark_channel_read: { Args: { p_channel: string }; Returns: undefined };
      mark_channel_unread: { Args: { p_channel: string; p_from: string }; Returns: undefined };
      create_poll: { Args: { p_channel: string; p_question: string; p_options: string[]; p_multi: boolean; p_hours: number }; Returns: string };
      timeout_member: { Args: { p_server: string; p_user: string; p_minutes: number; p_reason?: string }; Returns: string };
      remove_timeout: { Args: { p_server: string; p_user: string }; Returns: undefined };
      warn_member: { Args: { p_server: string; p_user: string; p_reason: string }; Returns: string };
      acknowledge_warnings: { Args: { p_server: string }; Returns: undefined };
      create_invite: { Args: { p_server: string; p_max_age_minutes: number; p_max_uses: number }; Returns: string };
      revoke_invite: { Args: { p_code: string }; Returns: undefined };
      export_my_data: { Args: Record<string, never>; Returns: Json };
      mark_all_read: { Args: { p_server?: string }; Returns: undefined };
      discover_servers: {
        Args: { p_query?: string; p_category?: string | null; p_limit?: number; p_offset?: number };
        Returns: { id: string; name: string; description: string; icon_url: string | null; category: string; member_count: number; active_members: number; is_member: boolean }[];
      };
      join_public_server: { Args: { p_server: string }; Returns: string };
      vote_poll: { Args: { p_message: string; p_options: number[] }; Returns: undefined };
      search_messages: {
        Args: { p_server: string; p_query: string; p_channel?: string | null; p_author?: string | null; p_before?: string | null; p_limit?: number };
        Returns: Database["public"]["Tables"]["messages"]["Row"][];
      };
      search_all_messages: {
        Args: { p_query: string; p_server?: string | null; p_channel?: string | null; p_author?: string | null; p_after?: string | null; p_before?: string | null; p_kind?: string | null; p_cursor_date?: string | null; p_cursor_id?: string | null; p_limit?: number };
        Returns: { source: string; id: string; server_id: string | null; channel_id: string | null; conversation_id: string | null; thread_id: string | null; author_id: string | null; content: string; created_at: string; attachments: Json }[];
      };
      save_workspace_document: { Args: { p_channel: string; p_kind: string; p_title: string; p_content: Json; p_id?: string | null; p_revision?: number; p_timer?: string | null }; Returns: Database["public"]["Tables"]["workspace_documents"]["Row"][] };
      delete_workspace_document: { Args: { p_id: string; p_revision: number }; Returns: undefined };
      can_edit_workspace: { Args: { p_channel: string }; Returns: boolean };
      list_server_events: { Args: { p_server: string }; Returns: (Database["public"]["Tables"]["server_events"]["Row"] & { interested: boolean })[] };
      save_workspace_asset: { Args: { p_channel: string; p_kind: string; p_content: Json; p_revision: number }; Returns: Database["public"]["Tables"]["workspace_assets"]["Row"][] };
      create_server_from_template: { Args: { p_name: string; p_description?: string; p_template?: string }; Returns: string };
      export_server_settings: { Args: { p_server: string }; Returns: Json };
      get_reactions_snapshot: { Args: { p_channel: string; p_messages: string[] }; Returns: Json };
      save_account_state: { Args: { p_key: string; p_value: Json; p_revision: number }; Returns: Database["public"]["Tables"]["account_state"]["Row"][] };
      admin_site_traffic: { Args: Record<string, never>; Returns: Json };
      push_ready: { Args: Record<string, never>; Returns: boolean };
      register_push: { Args: { p_device: string; p_endpoint: string; p_p256dh: string; p_auth: string; p_label: string }; Returns: string };
      list_push_devices: { Args: Record<string, never>; Returns: { id: string; device_id: string; label: string; created_at: string; last_delivered_at: string | null }[] };
      remove_push_device: { Args: { p_device?: string; p_all?: boolean }; Returns: undefined };
      request_push_test: { Args: { p_device: string }; Returns: undefined };
      claim_push_jobs: { Args: { p_limit?: number }; Returns: { id: string; lease: string }[] };
      prepare_push_job: { Args: { p_id: string; p_lease: string }; Returns: Json };
      finish_push_job: { Args: { p_id: string; p_lease: string; p_result: string; p_status?: number | null; p_code?: string; p_delay?: number }; Returns: undefined };
      tick_push: { Args: Record<string, never>; Returns: undefined };
      wake_push: { Args: Record<string, never>; Returns: undefined };
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
