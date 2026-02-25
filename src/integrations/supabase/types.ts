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
      alumnos: {
        Row: {
          created_at: string
          email: string
          estado: string
          grupo: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          estado?: string
          grupo?: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          estado?: string
          grupo?: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
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
          link_archivo: string | null
          origen_importacion_id: string | null
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
          link_archivo?: string | null
          origen_importacion_id?: string | null
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
          link_archivo?: string | null
          origen_importacion_id?: string | null
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
    }
    Enums: {
      app_role: "admin" | "alumno"
      estado_plan: "borrador" | "publicado"
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
      app_role: ["admin", "alumno"],
      estado_plan: ["borrador", "publicado"],
      grupo_ciclismo: ["G1", "G2", "G3", "G4", "Sin grupo", "Principiante"],
      tipo_entrenamiento: ["ruta", "rodillo", "gimnasio", "tecnica"],
    },
  },
} as const
