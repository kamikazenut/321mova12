export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      comments: {
        Row: {
          content: string;
          created_at: string;
          id: number;
          media_id: number;
          media_type: "movie" | "tv";
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: never;
          media_id: number;
          media_type: "movie" | "tv";
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: never;
          media_id?: number;
          media_type?: "movie" | "tv";
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      histories: {
        Row: {
          adult: boolean;
          backdrop_path: string | null;
          completed: boolean;
          created_at: string;
          duration: number;
          episode: number;
          id: number;
          last_position: number;
          media_id: number;
          poster_path: string | null;
          release_date: string;
          season: number;
          title: string;
          type: "movie" | "tv";
          updated_at: string;
          user_id: string;
          vote_average: number;
        };
        Insert: {
          adult: boolean;
          backdrop_path?: string | null;
          completed?: boolean;
          created_at?: string;
          duration?: number;
          episode?: number;
          id?: never;
          last_position?: number;
          media_id: number;
          poster_path?: string | null;
          release_date: string;
          season?: number;
          title: string;
          type: "movie" | "tv";
          updated_at?: string;
          user_id: string;
          vote_average: number;
        };
        Update: {
          adult?: boolean;
          backdrop_path?: string | null;
          completed?: boolean;
          created_at?: string;
          duration?: number;
          episode?: number;
          id?: never;
          last_position?: number;
          media_id?: number;
          poster_path?: string | null;
          release_date?: string;
          season?: number;
          title?: string;
          type?: "movie" | "tv";
          updated_at?: string;
          user_id?: string;
          vote_average?: number;
        };
        Relationships: [
          {
            foreignKeyName: "histories_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string | null;
          id: string;
          username: string;
        };
        Insert: {
          created_at?: string | null;
          id: string;
          username: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ratings: {
        Row: {
          created_at: string;
          media_id: number;
          media_type: "movie" | "tv";
          rating: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          media_id: number;
          media_type: "movie" | "tv";
          rating: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          media_id?: number;
          media_type?: "movie" | "tv";
          rating?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      watchlist: {
        Row: {
          adult: boolean;
          backdrop_path: string | null;
          created_at: string;
          id: number;
          poster_path: string | null;
          release_date: string;
          title: string;
          type: "movie" | "tv";
          user_id: string;
          vote_average: number;
        };
        Insert: {
          adult: boolean;
          backdrop_path?: string | null;
          created_at?: string;
          id: number;
          poster_path?: string | null;
          release_date: string;
          title: string;
          type: "movie" | "tv";
          user_id: string;
          vote_average: number;
        };
        Update: {
          adult?: boolean;
          backdrop_path?: string | null;
          created_at?: string;
          id?: number;
          poster_path?: string | null;
          release_date?: string;
          title?: string;
          type?: "movie" | "tv";
          user_id?: string;
          vote_average?: number;
        };
        Relationships: [
          {
            foreignKeyName: "watchlist_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_media_rating_stats: {
        Args: {
          p_media_id: number;
          p_media_type: string;
        };
        Returns: {
          average_rating: number;
          ratings_count: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
