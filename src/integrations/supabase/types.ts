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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          invite_send_count: number
          last_invite_sent_at: string | null
          last_login_at: string | null
          last_name: string
          password_set: boolean
          role: Database["public"]["Enums"]["admin_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          id?: string
          invite_send_count?: number
          last_invite_sent_at?: string | null
          last_login_at?: string | null
          last_name: string
          password_set?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          invite_send_count?: number
          last_invite_sent_at?: string | null
          last_login_at?: string | null
          last_name?: string
          password_set?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alumnos: {
        Row: {
          ciudad: string | null
          como_se_entero: string | null
          condicion_medica: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_telefono: string | null
          created_at: string
          direccion: string | null
          documento: string | null
          email: string
          estado: string
          grupo: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido: string | null
          id: string
          invite_send_count: number
          invited_at: string | null
          last_invite_sent_at: string | null
          nombre: string
          notas: string | null
          password_set: boolean
          profile_complete: boolean
          provincia: string | null
          registration_status: string
          telefono: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ciudad?: string | null
          como_se_entero?: string | null
          condicion_medica?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          direccion?: string | null
          documento?: string | null
          email: string
          estado?: string
          grupo?: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido?: string | null
          id?: string
          invite_send_count?: number
          invited_at?: string | null
          last_invite_sent_at?: string | null
          nombre: string
          notas?: string | null
          password_set?: boolean
          profile_complete?: boolean
          provincia?: string | null
          registration_status?: string
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ciudad?: string | null
          como_se_entero?: string | null
          condicion_medica?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          direccion?: string | null
          documento?: string | null
          email?: string
          estado?: string
          grupo?: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido?: string | null
          id?: string
          invite_send_count?: number
          invited_at?: string | null
          last_invite_sent_at?: string | null
          nombre?: string
          notas?: string | null
          password_set?: boolean
          profile_complete?: boolean
          provincia?: string | null
          registration_status?: string
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      asistencias: {
        Row: {
          alumno_id: string
          created_at: string
          entrenamiento_id: string
          estado: string
          id: string
          registrado_por: string | null
          updated_at: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          entrenamiento_id: string
          estado?: string
          id?: string
          registrado_por?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          entrenamiento_id?: string
          estado?: string
          id?: string
          registrado_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencias_entrenamiento_id_fkey"
            columns: ["entrenamiento_id"]
            isOneToOne: false
            referencedRelation: "entrenamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          created_at: string
          email: string
          estado: string
          grupos: Database["public"]["Enums"]["grupo_ciclismo"][]
          id: string
          invite_send_count: number
          invited_at: string | null
          last_invite_sent_at: string | null
          nombre: string
          password_set: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          estado?: string
          grupos?: Database["public"]["Enums"]["grupo_ciclismo"][]
          id?: string
          invite_send_count?: number
          invited_at?: string | null
          last_invite_sent_at?: string | null
          nombre: string
          password_set?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          estado?: string
          grupos?: Database["public"]["Enums"]["grupo_ciclismo"][]
          id?: string
          invite_send_count?: number
          invited_at?: string | null
          last_invite_sent_at?: string | null
          nombre?: string
          password_set?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entrenamientos: {
        Row: {
          created_at: string
          descripcion: string | null
          fecha: string
          grupo: Database["public"]["Enums"]["grupo_ciclismo"]
          id: string
          intensidad: number
          link_archivo: string | null
          origen_importacion_id: string | null
          resistencia: number
          tecnica: number
          tipo: Database["public"]["Enums"]["tipo_entrenamiento"] | null
          titulo: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fecha: string
          grupo: Database["public"]["Enums"]["grupo_ciclismo"]
          id?: string
          intensidad?: number
          link_archivo?: string | null
          origen_importacion_id?: string | null
          resistencia?: number
          tecnica?: number
          tipo?: Database["public"]["Enums"]["tipo_entrenamiento"] | null
          titulo: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fecha?: string
          grupo?: Database["public"]["Enums"]["grupo_ciclismo"]
          id?: string
          intensidad?: number
          link_archivo?: string | null
          origen_importacion_id?: string | null
          resistencia?: number
          tecnica?: number
          tipo?: Database["public"]["Enums"]["tipo_entrenamiento"] | null
          titulo?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "entrenamientos_origen_importacion_id_fkey"
            columns: ["origen_importacion_id"]
            isOneToOne: false
            referencedRelation: "plan_mensual"
            referencedColumns: ["id"]
          },
        ]
      }
      entrenamientos_realizados: {
        Row: {
          alumno_id: string
          created_at: string
          entrenamiento_id: string
          id: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          entrenamiento_id: string
          id?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          entrenamiento_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrenamientos_realizados_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrenamientos_realizados_entrenamiento_id_fkey"
            columns: ["entrenamiento_id"]
            isOneToOne: false
            referencedRelation: "entrenamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          checked_in_at: string
          created_at: string
          email: string
          event_slug: string
          evidence_url: string | null
          first_name: string
          id: string
          last_name: string
          last_request_email_sent_at: string | null
          participant_comment: string | null
          position: number | null
          public_access_token: string
          rejection_reason: string | null
          request_email_count: number
          results_updated_at: string | null
          score: number | null
          staff_feedback: string | null
          status: string
          team_name: string
          time_result: string | null
          time_value: number | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          checked_in_at?: string
          created_at?: string
          email: string
          event_slug?: string
          evidence_url?: string | null
          first_name: string
          id?: string
          last_name: string
          last_request_email_sent_at?: string | null
          participant_comment?: string | null
          position?: number | null
          public_access_token?: string
          rejection_reason?: string | null
          request_email_count?: number
          results_updated_at?: string | null
          score?: number | null
          staff_feedback?: string | null
          status?: string
          team_name: string
          time_result?: string | null
          time_value?: number | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          checked_in_at?: string
          created_at?: string
          email?: string
          event_slug?: string
          evidence_url?: string | null
          first_name?: string
          id?: string
          last_name?: string
          last_request_email_sent_at?: string | null
          participant_comment?: string | null
          position?: number | null
          public_access_token?: string
          rejection_reason?: string | null
          request_email_count?: number
          results_updated_at?: string | null
          score?: number | null
          staff_feedback?: string | null
          status?: string
          team_name?: string
          time_result?: string | null
          time_value?: number | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_results: {
        Row: {
          alumno_id: string
          avg_speed_kmh: number | null
          created_at: string
          distance_km: number | null
          event_id: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          alumno_id: string
          avg_speed_kmh?: number | null
          created_at?: string
          distance_km?: number | null
          event_id: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          avg_speed_kmh?: number | null
          created_at?: string
          distance_km?: number | null
          event_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_results_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          date: string
          description: string | null
          end_time: string | null
          id: string
          is_active: boolean
          start_time: string | null
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
          visible_to_students: boolean
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          start_time?: string | null
          title: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visible_to_students?: boolean
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          start_time?: string | null
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visible_to_students?: boolean
        }
        Relationships: []
      }
      feedback_coach: {
        Row: {
          alumno_id: string
          coach_id: string
          comentario: string
          created_at: string
          entrenamiento_id: string | null
          fecha: string
          id: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          alumno_id: string
          coach_id: string
          comentario: string
          created_at?: string
          entrenamiento_id?: string | null
          fecha?: string
          id?: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          coach_id?: string
          comentario?: string
          created_at?: string
          entrenamiento_id?: string | null
          fecha?: string
          id?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_coach_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_coach_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_coach_entrenamiento_id_fkey"
            columns: ["entrenamiento_id"]
            isOneToOne: false
            referencedRelation: "entrenamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      importaciones_usuarios: {
        Row: {
          archivo_original_url: string | null
          cantidad_error: number
          cantidad_ok: number
          cargado_por: string | null
          created_at: string
          fecha_carga: string
          id: string
          log_errores: string | null
        }
        Insert: {
          archivo_original_url?: string | null
          cantidad_error?: number
          cantidad_ok?: number
          cargado_por?: string | null
          created_at?: string
          fecha_carga?: string
          id?: string
          log_errores?: string | null
        }
        Update: {
          archivo_original_url?: string | null
          cantidad_error?: number
          cantidad_ok?: number
          cargado_por?: string | null
          created_at?: string
          fecha_carga?: string
          id?: string
          log_errores?: string | null
        }
        Relationships: []
      }
      plan_mensual: {
        Row: {
          archivo_original_url: string | null
          cargado_por: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_plan"]
          fecha_carga: string
          id: string
          mes: string
        }
        Insert: {
          archivo_original_url?: string | null
          cargado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_plan"]
          fecha_carga?: string
          id?: string
          mes: string
        }
        Update: {
          archivo_original_url?: string | null
          cargado_por?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_plan"]
          fecha_carga?: string
          id?: string
          mes?: string
        }
        Relationships: []
      }
      planes: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          frecuencia: string
          id: string
          nombre: string
          precio: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          frecuencia: string
          id?: string
          nombre: string
          precio: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          frecuencia?: string
          id?: string
          nombre?: string
          precio?: number
        }
        Relationships: []
      }
      postulaciones_asesoria: {
        Row: {
          created_at: string
          descripcion: string | null
          email: string
          estado: string
          fecha_nacimiento: string | null
          id: string
          nombre_completo: string
          tipo_asesoria: string
          whatsapp: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          email: string
          estado?: string
          fecha_nacimiento?: string | null
          id?: string
          nombre_completo: string
          tipo_asesoria: string
          whatsapp: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          email?: string
          estado?: string
          fecha_nacimiento?: string | null
          id?: string
          nombre_completo?: string
          tipo_asesoria?: string
          whatsapp?: string
        }
        Relationships: []
      }
      suscripciones: {
        Row: {
          alumno_id: string
          created_at: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          mp_status: string | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      publish_month: { Args: { p_mes: string }; Returns: number }
      register_coach: {
        Args: { _email: string; _nombre: string; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      admin_role: "super_admin" | "admin" | "support"
      app_role: "admin" | "alumno" | "coach"
      estado_plan: "borrador" | "publicado"
      event_type: "record_hora" | "camp" | "carrera" | "otro"
      grupo_ciclismo: "G1" | "G2" | "G3" | "G4" | "Sin grupo" | "Principiante"
      tipo_entrenamiento: "ruta" | "rodillo" | "gimnasio" | "tecnica"
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
      admin_role: ["super_admin", "admin", "support"],
      app_role: ["admin", "alumno", "coach"],
      estado_plan: ["borrador", "publicado"],
      event_type: ["record_hora", "camp", "carrera", "otro"],
      grupo_ciclismo: ["G1", "G2", "G3", "G4", "Sin grupo", "Principiante"],
      tipo_entrenamiento: ["ruta", "rodillo", "gimnasio", "tecnica"],
    },
  },
} as const
