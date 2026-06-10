export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          belle_base_url: string | null
          evogo_admin_token: string | null
          evogo_proxy: string | null
          evogo_url: string | null
          id: boolean
          updated_at: string
        }
        Insert: {
          belle_base_url?: string | null
          evogo_admin_token?: string | null
          evogo_proxy?: string | null
          evogo_url?: string | null
          id?: boolean
          updated_at?: string
        }
        Update: {
          belle_base_url?: string | null
          evogo_admin_token?: string | null
          evogo_proxy?: string | null
          evogo_url?: string | null
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          created_at: string
          error: string | null
          id: string
          name: string | null
          number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["send_queue_status"]
          variables: Json | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error?: string | null
          id?: string
          name?: string | null
          number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["send_queue_status"]
          variables?: Json | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error?: string | null
          id?: string
          name?: string | null
          number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["send_queue_status"]
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          company_id: string
          created_at: string
          failed_count: number
          id: string
          instance_id: string | null
          interval_seconds: number
          last_processed_at: string | null
          message_id: string
          name: string
          scheduled_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          total_contacts: number
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          failed_count?: number
          id?: string
          instance_id?: string | null
          interval_seconds?: number
          last_processed_at?: string | null
          message_id: string
          name: string
          scheduled_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          total_contacts?: number
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          failed_count?: number
          id?: string
          instance_id?: string | null
          interval_seconds?: number
          last_processed_at?: string | null
          message_id?: string
          name?: string
          scheduled_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          total_contacts?: number
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          api_token: string | null
          created_at: string
          document: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_token?: string | null
          created_at?: string
          document?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_token?: string | null
          created_at?: string
          document?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_jobs: {
        Row: {
          active: boolean
          auto_dispatch: boolean
          company_id: string
          created_at: string
          days_of_week: number[]
          days_offset: number
          id: string
          instance_mapping: Json | null
          last_run_at: string | null
          last_run_count: number | null
          last_run_error: string | null
          last_run_status: string | null
          message_id: string
          name: string | null
          schedule_time: string
          status_filter: string | null
          tipo_filter: string | null
          trigger_source: string | null
          unit_ids: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_dispatch?: boolean
          company_id: string
          created_at?: string
          days_of_week?: number[]
          days_offset?: number
          id?: string
          instance_mapping?: Json | null
          last_run_at?: string | null
          last_run_count?: number | null
          last_run_error?: string | null
          last_run_status?: string | null
          message_id: string
          name?: string | null
          schedule_time: string
          status_filter?: string | null
          tipo_filter?: string | null
          trigger_source?: string | null
          unit_ids?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_dispatch?: boolean
          company_id?: string
          created_at?: string
          days_of_week?: number[]
          days_offset?: number
          id?: string
          instance_mapping?: Json | null
          last_run_at?: string | null
          last_run_count?: number | null
          last_run_error?: string | null
          last_run_status?: string | null
          message_id?: string
          name?: string | null
          schedule_time?: string
          status_filter?: string | null
          tipo_filter?: string | null
          trigger_source?: string | null
          unit_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cron_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cron_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          evogo_api_key: string
          evogo_instance_id: string | null
          id: string
          instance_name: string
          name: string
          status: Database["public"]["Enums"]["instance_status"]
          unit_id: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          evogo_api_key: string
          evogo_instance_id?: string | null
          id?: string
          instance_name: string
          name: string
          status?: Database["public"]["Enums"]["instance_status"]
          unit_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          evogo_api_key?: string
          evogo_instance_id?: string | null
          id?: string
          instance_name?: string
          name?: string
          status?: Database["public"]["Enums"]["instance_status"]
          unit_id?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instances_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      message_send_logs: {
        Row: {
          content_data: Json | null
          error: string | null
          id: string
          instance_id: string
          message_id: string | null
          message_type: string
          number: string
          sent_at: string
          success: boolean
          text: string
          trigger_source: string | null
        }
        Insert: {
          content_data?: Json | null
          error?: string | null
          id?: string
          instance_id: string
          message_id?: string | null
          message_type?: string
          number: string
          sent_at?: string
          success: boolean
          text: string
          trigger_source?: string | null
        }
        Update: {
          content_data?: Json | null
          error?: string | null
          id?: string
          instance_id?: string
          message_id?: string | null
          message_type?: string
          number?: string
          sent_at?: string
          success?: boolean
          text?: string
          trigger_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_send_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          active: boolean
          company_id: string
          content_data: Json | null
          created_at: string
          id: string
          instance_id: string | null
          message_type: string
          name: string
          template: string
          trigger_source: string | null
          unit_ids: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          content_data?: Json | null
          created_at?: string
          id?: string
          instance_id?: string | null
          message_type?: string
          name: string
          template: string
          trigger_source?: string | null
          unit_ids?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          content_data?: Json | null
          created_at?: string
          id?: string
          instance_id?: string | null
          message_type?: string
          name?: string
          template?: string
          trigger_source?: string | null
          unit_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      send_queue: {
        Row: {
          agendamento_data: Json | null
          campaign_id: string | null
          cliente_cod: string | null
          cliente_nome: string | null
          cod_consulta: number | null
          company_id: string
          contact_id: string | null
          content_data: Json | null
          created_at: string
          id: string
          instance_id: string | null
          last_error: string | null
          message_id: string | null
          message_type: string
          number: string
          scheduled_at: string | null
          status: Database["public"]["Enums"]["send_queue_status"]
          text: string
          trigger_source: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          agendamento_data?: Json | null
          campaign_id?: string | null
          cliente_cod?: string | null
          cliente_nome?: string | null
          cod_consulta?: number | null
          company_id: string
          contact_id?: string | null
          content_data?: Json | null
          created_at?: string
          id?: string
          instance_id?: string | null
          last_error?: string | null
          message_id?: string | null
          message_type?: string
          number: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["send_queue_status"]
          text: string
          trigger_source?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_data?: Json | null
          campaign_id?: string | null
          cliente_cod?: string | null
          cliente_nome?: string | null
          cod_consulta?: number | null
          company_id?: string
          contact_id?: string | null
          content_data?: Json | null
          created_at?: string
          id?: string
          instance_id?: string | null
          last_error?: string | null
          message_id?: string | null
          message_type?: string
          number?: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["send_queue_status"]
          text?: string
          trigger_source?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "send_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "campaign_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          active: boolean
          belle_base_url: string | null
          belle_cod_estab: string | null
          belle_token: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          belle_base_url?: string | null
          belle_cod_estab?: string | null
          belle_token?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          belle_base_url?: string | null
          belle_cod_estab?: string | null
          belle_token?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id: string
          created_at: string
          company_id: string | null
          unit_id: string | null
          name: string | null
          number: string
          groups: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          company_id?: string | null
          unit_id?: string | null
          name?: string | null
          number: string
          groups?: Json | null
        }
        Update: {
          id?: string
          created_at?: string
          company_id?: string | null
          unit_id?: string | null
          name?: string | null
          number?: string
          groups?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_campaign_failed: {
        Args: { campaign_id_param: string }
        Returns: undefined
      }
      increment_campaign_sent: {
        Args: { campaign_id_param: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "company_admin" | "operator"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "canceled"
      instance_status: "disconnected" | "connecting" | "connected" | "error"
      message_trigger_type:
        | "appointment_reminder"
        | "appointment_confirmation"
        | "installment_due"
        | "installment_overdue"
        | "custom"
      send_queue_status: "pending" | "sent" | "failed" | "cancelled" | "paused" | "processing"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "company_admin", "operator"],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "canceled",
      ],
      instance_status: ["disconnected", "connecting", "connected", "error"],
      message_trigger_type: [
        "appointment_reminder",
        "appointment_confirmation",
        "installment_due",
        "installment_overdue",
        "custom",
      ],
      send_queue_status: ["pending", "sent", "failed", "cancelled", "paused", "processing"],
    },
  },
} as const
