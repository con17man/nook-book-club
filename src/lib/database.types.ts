// Hand-written to match supabase/migrations, in the same shape `supabase gen types` emits.
// Once a Supabase project is linked, regenerate with `npm run db:types`.
// App-level aliases live in src/lib/types.ts so regeneration never clobbers them.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          onboarded_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: { full_name?: string | null; role?: Database["public"]["Enums"]["user_role"] };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          starts_at: string;
          location: string;
          capacity: number;
          status: Database["public"]["Enums"]["event_status"];
          submissions_close_at: string;
          voting_closes_at: string | null;
          runoff_closes_at: string | null;
          winning_book_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: {
          title?: string;
          description?: string | null;
          starts_at?: string;
          location?: string;
          capacity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "events_winning_book_id_fkey";
            columns: ["winning_book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };
      books: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          author: string | null;
          title_key: string;
          added_by: string | null;
          shortlisted: boolean;
          in_runoff: boolean;
          created_at: string;
        };
        Insert: { event_id: string; title: string; author?: string | null };
        Update: { title?: string; author?: string | null; shortlisted?: boolean };
        Relationships: [
          {
            foreignKeyName: "books_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: { event_id: string; user_id: string; book_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "submissions_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      votes: {
        Row: { event_id: string; round: number; user_id: string; book_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          status: Database["public"]["Enums"]["reservation_status"];
          queued_at: string;
          invite_expires_at: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "reservations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      email_outbox: {
        Row: {
          id: number;
          to_email: string;
          template: string;
          payload: Json;
          created_at: string;
          sent_at: string | null;
          attempts: number;
          last_error: string | null;
        };
        Insert: { to_email: string; template: string; payload?: Json };
        Update: { sent_at?: string | null; attempts?: number; last_error?: string | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      submit_book: { Args: { p_event_id: string; p_title: string; p_author?: string | null }; Returns: string };
      withdraw_submission: { Args: { p_event_id: string }; Returns: undefined };
      cast_votes: { Args: { p_event_id: string; p_book_ids: string[] }; Returns: undefined };
      get_vote_results: {
        Args: { p_event_id: string };
        Returns: { round: number; book_id: string; votes: number }[];
      };
      reserve_spot: { Args: { p_event_id: string }; Returns: Database["public"]["Enums"]["reservation_status"] };
      accept_invite: { Args: { p_event_id: string }; Returns: undefined };
      cancel_reservation: { Args: { p_event_id: string }; Returns: undefined };
      create_event: {
        Args: {
          p_title: string;
          p_description: string | null;
          p_starts_at: string;
          p_location: string;
          p_capacity: number;
        };
        Returns: string;
      };
      start_voting: { Args: { p_event_id: string }; Returns: undefined };
      pick_winner: { Args: { p_event_id: string; p_book_id: string }; Returns: undefined };
      cancel_event: { Args: { p_event_id: string }; Returns: undefined };
      process_deadlines: { Args: Record<PropertyKey, never>; Returns: Json };
    };
    Enums: {
      user_role: "admin" | "member";
      event_status:
        | "submissions"
        | "curation"
        | "voting"
        | "runoff"
        | "tiebreak"
        | "reservations"
        | "completed"
        | "cancelled";
      reservation_status: "confirmed" | "waitlisted" | "invited" | "cancelled" | "expired";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
