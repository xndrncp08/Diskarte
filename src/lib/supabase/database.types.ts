// Types mirroring supabase/migrations/20260926000000_schema.sql.
// Regenerate with `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "member" | "moderator" | "admin";
export type ChannelType = "text" | "voice";
export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

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
          owner_id: string;
          invite_code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          icon_url?: string | null;
          owner_id: string;
          invite_code?: string;
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
