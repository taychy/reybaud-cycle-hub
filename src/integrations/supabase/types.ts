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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_notification_events: {
        Row: {
          created_at: string
          deduplication_key: string | null
          destinatarios: string[]
          id: string
          intentos: number
          last_error: string | null
          payload: Json
          prioridad: string
          reservation_id: string | null
          sent_at: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deduplication_key?: string | null
          destinatarios?: string[]
          id?: string
          intentos?: number
          last_error?: string | null
          payload?: Json
          prioridad?: string
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deduplication_key?: string | null
          destinatarios?: string[]
          id?: string
          intentos?: number
          last_error?: string | null
          payload?: Json
          prioridad?: string
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notification_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notification_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
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
          notification_prefs: Json
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
          notification_prefs?: Json
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
          notification_prefs?: Json
          password_set?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_section_seen: {
        Row: {
          section_key: string
          seen_at: string
          user_id: string
        }
        Insert: {
          section_key: string
          seen_at?: string
          user_id: string
        }
        Update: {
          section_key?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agenda_grupal: {
        Row: {
          activo: boolean
          coach_id: string
          created_at: string
          dia_semana: number
          grupo: string
          honorario_id: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          notas: string | null
          sede_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coach_id: string
          created_at?: string
          dia_semana: number
          grupo?: string
          honorario_id?: string | null
          hora_fin: string
          hora_inicio: string
          id?: string
          notas?: string | null
          sede_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coach_id?: string
          created_at?: string
          dia_semana?: number
          grupo?: string
          honorario_id?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          notas?: string | null
          sede_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_grupal_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_grupal_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_grupal_honorario_id_fkey"
            columns: ["honorario_id"]
            isOneToOne: false
            referencedRelation: "honorarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_grupal_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      alumno_email_links: {
        Row: {
          alumno_id: string
          confirmed_at: string | null
          created_at: string
          estado: string
          expires_at: string
          id: string
          motivo: string
          nuevo_email: string
          token: string
          updated_at: string
        }
        Insert: {
          alumno_id: string
          confirmed_at?: string | null
          created_at?: string
          estado?: string
          expires_at?: string
          id?: string
          motivo: string
          nuevo_email: string
          token: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          confirmed_at?: string | null
          created_at?: string
          estado?: string
          expires_at?: string
          id?: string
          motivo?: string
          nuevo_email?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumno_email_links_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_email_links_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "alumno_email_links_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      alumno_evaluaciones_coach: {
        Row: {
          actitud: number | null
          actitud_nota: string | null
          alumno_id: string
          cadencia: number | null
          cadencia_nota: string | null
          coach_id_ultimo: string | null
          constancia: number | null
          constancia_nota: string | null
          created_at: string
          fisico: number | null
          fisico_nota: string | null
          id: string
          manejo: number | null
          manejo_nota: string | null
          postura: number | null
          postura_nota: string | null
          potencia: number | null
          potencia_nota: string | null
          progreso: number | null
          progreso_nota: string | null
          promedio_rendimiento: number | null
          promedio_tecnico: number | null
          updated_at: string
        }
        Insert: {
          actitud?: number | null
          actitud_nota?: string | null
          alumno_id: string
          cadencia?: number | null
          cadencia_nota?: string | null
          coach_id_ultimo?: string | null
          constancia?: number | null
          constancia_nota?: string | null
          created_at?: string
          fisico?: number | null
          fisico_nota?: string | null
          id?: string
          manejo?: number | null
          manejo_nota?: string | null
          postura?: number | null
          postura_nota?: string | null
          potencia?: number | null
          potencia_nota?: string | null
          progreso?: number | null
          progreso_nota?: string | null
          promedio_rendimiento?: number | null
          promedio_tecnico?: number | null
          updated_at?: string
        }
        Update: {
          actitud?: number | null
          actitud_nota?: string | null
          alumno_id?: string
          cadencia?: number | null
          cadencia_nota?: string | null
          coach_id_ultimo?: string | null
          constancia?: number | null
          constancia_nota?: string | null
          created_at?: string
          fisico?: number | null
          fisico_nota?: string | null
          id?: string
          manejo?: number | null
          manejo_nota?: string | null
          postura?: number | null
          postura_nota?: string | null
          potencia?: number | null
          potencia_nota?: string | null
          progreso?: number | null
          progreso_nota?: string | null
          promedio_rendimiento?: number | null
          promedio_tecnico?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumno_evaluaciones_coach_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_coach_id_ultimo_fkey"
            columns: ["coach_id_ultimo"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_coach_id_ultimo_fkey"
            columns: ["coach_id_ultimo"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      alumno_evaluaciones_coach_notas: {
        Row: {
          alumno_id: string
          autor_nombre: string | null
          coach_id: string | null
          created_at: string
          feedback_id: string | null
          id: string
          nota: string
          snapshot_scores: Json | null
        }
        Insert: {
          alumno_id: string
          autor_nombre?: string | null
          coach_id?: string | null
          created_at?: string
          feedback_id?: string | null
          id?: string
          nota: string
          snapshot_scores?: Json | null
        }
        Update: {
          alumno_id?: string
          autor_nombre?: string | null
          coach_id?: string | null
          created_at?: string
          feedback_id?: string | null
          id?: string
          nota?: string
          snapshot_scores?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "alumno_evaluaciones_coach_notas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_notas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_notas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_notas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_notas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_evaluaciones_coach_notas_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_coach"
            referencedColumns: ["id"]
          },
        ]
      }
      alumno_familiares: {
        Row: {
          alumno_id: string
          created_at: string
          created_by: string | null
          familiar_alumno_id: string | null
          familiar_externo_nombre: string | null
          familiar_externo_telefono: string | null
          id: string
          notas: string | null
          relacion: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          created_by?: string | null
          familiar_alumno_id?: string | null
          familiar_externo_nombre?: string | null
          familiar_externo_telefono?: string | null
          id?: string
          notas?: string | null
          relacion?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          created_by?: string | null
          familiar_alumno_id?: string | null
          familiar_externo_nombre?: string | null
          familiar_externo_telefono?: string | null
          id?: string
          notas?: string | null
          relacion?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumno_familiares_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_familiares_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "alumno_familiares_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "alumno_familiares_familiar_alumno_id_fkey"
            columns: ["familiar_alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_familiares_familiar_alumno_id_fkey"
            columns: ["familiar_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "alumno_familiares_familiar_alumno_id_fkey"
            columns: ["familiar_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      alumno_notas: {
        Row: {
          alumno_id: string
          contenido: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          alumno_id: string
          contenido: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          contenido?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumno_notas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_notas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "alumno_notas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      alumnos: {
        Row: {
          afip_padron_snapshot: Json | null
          afip_verificado_at: string | null
          apellido: string | null
          baja_confirmada_por_user_id: string | null
          baja_solicitud_id: string | null
          ciudad: string | null
          como_se_entero: string | null
          condicion_fiscal: string
          condicion_medica: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_nombre_2: string | null
          contacto_emergencia_relacion: string | null
          contacto_emergencia_relacion_2: string | null
          contacto_emergencia_telefono: string | null
          contacto_emergencia_telefono_2: string | null
          created_at: string
          direccion: string | null
          documento: string | null
          domicilio_fiscal: string | null
          email: string
          emails_adicionales: string[]
          es_staff: boolean
          estado: string
          fecha_baja: string | null
          fecha_nacimiento: string | null
          fusionada_at: string | null
          fusionada_en: string | null
          grupo: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido: string | null
          id: string
          invite_send_count: number
          invited_at: string | null
          last_invite_sent_at: string | null
          medical_certificate_expiration_date: string | null
          medical_certificate_requested_at: string | null
          medical_certificate_signature_date: string | null
          medical_certificate_status: string
          medical_certificate_uploaded_at: string | null
          medical_certificate_url: string | null
          motivo_baja: string | null
          nombre: string
          nombre_fiscal: string | null
          nombres_bancarios: string[]
          notas: string | null
          obra_social_nombre: string | null
          obra_social_numero_socio: string | null
          obra_social_plan: string | null
          origen_cohort: string | null
          origen_cohort_fecha: string | null
          password_set: boolean
          pause_fecha_estimada_retorno: string | null
          pause_motivo: string | null
          pause_proximo_followup: string | null
          pause_ultimo_contacto_at: string | null
          profile_complete: boolean
          provincia: string | null
          reactivada_at: string | null
          reactivada_por_user_id: string | null
          registration_status: string
          saldo_a_favor: number
          sede_id: string | null
          telefono: string | null
          tipo_documento: string
          ultimo_saludo_cumple_year: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          afip_padron_snapshot?: Json | null
          afip_verificado_at?: string | null
          apellido?: string | null
          baja_confirmada_por_user_id?: string | null
          baja_solicitud_id?: string | null
          ciudad?: string | null
          como_se_entero?: string | null
          condicion_fiscal?: string
          condicion_medica?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_nombre_2?: string | null
          contacto_emergencia_relacion?: string | null
          contacto_emergencia_relacion_2?: string | null
          contacto_emergencia_telefono?: string | null
          contacto_emergencia_telefono_2?: string | null
          created_at?: string
          direccion?: string | null
          documento?: string | null
          domicilio_fiscal?: string | null
          email: string
          emails_adicionales?: string[]
          es_staff?: boolean
          estado?: string
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          fusionada_at?: string | null
          fusionada_en?: string | null
          grupo?: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido?: string | null
          id?: string
          invite_send_count?: number
          invited_at?: string | null
          last_invite_sent_at?: string | null
          medical_certificate_expiration_date?: string | null
          medical_certificate_requested_at?: string | null
          medical_certificate_signature_date?: string | null
          medical_certificate_status?: string
          medical_certificate_uploaded_at?: string | null
          medical_certificate_url?: string | null
          motivo_baja?: string | null
          nombre: string
          nombre_fiscal?: string | null
          nombres_bancarios?: string[]
          notas?: string | null
          obra_social_nombre?: string | null
          obra_social_numero_socio?: string | null
          obra_social_plan?: string | null
          origen_cohort?: string | null
          origen_cohort_fecha?: string | null
          password_set?: boolean
          pause_fecha_estimada_retorno?: string | null
          pause_motivo?: string | null
          pause_proximo_followup?: string | null
          pause_ultimo_contacto_at?: string | null
          profile_complete?: boolean
          provincia?: string | null
          reactivada_at?: string | null
          reactivada_por_user_id?: string | null
          registration_status?: string
          saldo_a_favor?: number
          sede_id?: string | null
          telefono?: string | null
          tipo_documento?: string
          ultimo_saludo_cumple_year?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          afip_padron_snapshot?: Json | null
          afip_verificado_at?: string | null
          apellido?: string | null
          baja_confirmada_por_user_id?: string | null
          baja_solicitud_id?: string | null
          ciudad?: string | null
          como_se_entero?: string | null
          condicion_fiscal?: string
          condicion_medica?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_nombre_2?: string | null
          contacto_emergencia_relacion?: string | null
          contacto_emergencia_relacion_2?: string | null
          contacto_emergencia_telefono?: string | null
          contacto_emergencia_telefono_2?: string | null
          created_at?: string
          direccion?: string | null
          documento?: string | null
          domicilio_fiscal?: string | null
          email?: string
          emails_adicionales?: string[]
          es_staff?: boolean
          estado?: string
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          fusionada_at?: string | null
          fusionada_en?: string | null
          grupo?: Database["public"]["Enums"]["grupo_ciclismo"]
          grupo_preferido?: string | null
          id?: string
          invite_send_count?: number
          invited_at?: string | null
          last_invite_sent_at?: string | null
          medical_certificate_expiration_date?: string | null
          medical_certificate_requested_at?: string | null
          medical_certificate_signature_date?: string | null
          medical_certificate_status?: string
          medical_certificate_uploaded_at?: string | null
          medical_certificate_url?: string | null
          motivo_baja?: string | null
          nombre?: string
          nombre_fiscal?: string | null
          nombres_bancarios?: string[]
          notas?: string | null
          obra_social_nombre?: string | null
          obra_social_numero_socio?: string | null
          obra_social_plan?: string | null
          origen_cohort?: string | null
          origen_cohort_fecha?: string | null
          password_set?: boolean
          pause_fecha_estimada_retorno?: string | null
          pause_motivo?: string | null
          pause_proximo_followup?: string | null
          pause_ultimo_contacto_at?: string | null
          profile_complete?: boolean
          provincia?: string | null
          reactivada_at?: string | null
          reactivada_por_user_id?: string | null
          registration_status?: string
          saldo_a_favor?: number
          sede_id?: string | null
          telefono?: string | null
          tipo_documento?: string
          ultimo_saludo_cumple_year?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alumnos_baja_solicitud_id_fkey"
            columns: ["baja_solicitud_id"]
            isOneToOne: false
            referencedRelation: "bajas_solicitudes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumnos_fusionada_en_fkey"
            columns: ["fusionada_en"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumnos_fusionada_en_fkey"
            columns: ["fusionada_en"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "alumnos_fusionada_en_fkey"
            columns: ["fusionada_en"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "alumnos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      asesoria_asignaciones: {
        Row: {
          activa: boolean
          alumno_id: string
          coach_id: string
          created_at: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          alumno_id: string
          coach_id: string
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          alumno_id?: string
          coach_id?: string
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asesoria_asignaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asesoria_asignaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "asesoria_asignaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "asesoria_asignaciones_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asesoria_asignaciones_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "asistencias_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "asistencias_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
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
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_email: string | null
          user_id: string | null
          user_role: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_email?: string | null
          user_id?: string | null
          user_role: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
          user_role?: string
        }
        Relationships: []
      }
      ausencias_coaches: {
        Row: {
          coach_id: string
          creado_por: string | null
          created_at: string
          fecha_fin: string
          fecha_inicio: string
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          motivo: string | null
          todo_el_dia: boolean
          updated_at: string
        }
        Insert: {
          coach_id: string
          creado_por?: string | null
          created_at?: string
          fecha_fin: string
          fecha_inicio: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          todo_el_dia?: boolean
          updated_at?: string
        }
        Update: {
          coach_id?: string
          creado_por?: string | null
          created_at?: string
          fecha_fin?: string
          fecha_inicio?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          todo_el_dia?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bajas_solicitudes: {
        Row: {
          alumno_id: string
          comentario: string | null
          confirmada_at: string | null
          confirmada_notas: string | null
          confirmada_por_user_id: string | null
          created_at: string
          email_notificado: boolean
          estado: string
          evitada_at: string | null
          evitada_motivo: string | null
          evitada_por_user_id: string | null
          id: string
          motivo: string
          motivo_otro_detalle: string | null
          origen: string
          snapshot: Json
          solicitada_por_user_id: string | null
          updated_at: string
        }
        Insert: {
          alumno_id: string
          comentario?: string | null
          confirmada_at?: string | null
          confirmada_notas?: string | null
          confirmada_por_user_id?: string | null
          created_at?: string
          email_notificado?: boolean
          estado?: string
          evitada_at?: string | null
          evitada_motivo?: string | null
          evitada_por_user_id?: string | null
          id?: string
          motivo: string
          motivo_otro_detalle?: string | null
          origen: string
          snapshot?: Json
          solicitada_por_user_id?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          comentario?: string | null
          confirmada_at?: string | null
          confirmada_notas?: string | null
          confirmada_por_user_id?: string | null
          created_at?: string
          email_notificado?: boolean
          estado?: string
          evitada_at?: string | null
          evitada_motivo?: string | null
          evitada_por_user_id?: string | null
          id?: string
          motivo?: string
          motivo_otro_detalle?: string | null
          origen?: string
          snapshot?: Json
          solicitada_por_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bajas_solicitudes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bajas_solicitudes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "bajas_solicitudes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          alumno_id: string | null
          brevo_message_id: string | null
          broadcast_id: string
          created_at: string
          email: string
          error_message: string | null
          id: string
          name: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          alumno_id?: string | null
          brevo_message_id?: string | null
          broadcast_id: string
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          name?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          alumno_id?: string | null
          brevo_message_id?: string | null
          broadcast_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          name?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_sender_config: {
        Row: {
          id: string
          reply_to: string | null
          sender_email: string
          sender_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          reply_to?: string | null
          sender_email: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          reply_to?: string | null
          sender_email?: string
          sender_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      broadcast_templates: {
        Row: {
          content_html: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          content_html: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          content_html?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          brevo_message_ids: Json | null
          content_html: string
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_count: number
          id: string
          preheader: string | null
          promo_product_ids: string[]
          reply_to: string | null
          segment_filters: Json
          sender_email: string
          sender_name: string
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          total_recipients: number
        }
        Insert: {
          brevo_message_ids?: Json | null
          content_html: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          id?: string
          preheader?: string | null
          promo_product_ids?: string[]
          reply_to?: string | null
          segment_filters?: Json
          sender_email: string
          sender_name: string
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          total_recipients?: number
        }
        Update: {
          brevo_message_ids?: Json | null
          content_html?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          id?: string
          preheader?: string | null
          promo_product_ids?: string[]
          reply_to?: string | null
          segment_filters?: Json
          sender_email?: string
          sender_name?: string
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          total_recipients?: number
        }
        Relationships: []
      }
      cambios_plan: {
        Row: {
          alumno_id: string
          costo_nuevo_prorrateado: number
          created_at: string
          credito_calculado: number
          dias_restantes: number
          dias_totales: number
          diferencia: number
          id: string
          notas: string | null
          plan_anterior_id: string
          plan_nuevo_id: string
          precio_anterior: number
          precio_nuevo: number
          realizado_por: string | null
          saldo_aplicado: number
          suscripcion_anterior_id: string
          suscripcion_nueva_id: string
        }
        Insert: {
          alumno_id: string
          costo_nuevo_prorrateado?: number
          created_at?: string
          credito_calculado?: number
          dias_restantes: number
          dias_totales: number
          diferencia?: number
          id?: string
          notas?: string | null
          plan_anterior_id: string
          plan_nuevo_id: string
          precio_anterior: number
          precio_nuevo: number
          realizado_por?: string | null
          saldo_aplicado?: number
          suscripcion_anterior_id: string
          suscripcion_nueva_id: string
        }
        Update: {
          alumno_id?: string
          costo_nuevo_prorrateado?: number
          created_at?: string
          credito_calculado?: number
          dias_restantes?: number
          dias_totales?: number
          diferencia?: number
          id?: string
          notas?: string | null
          plan_anterior_id?: string
          plan_nuevo_id?: string
          precio_anterior?: number
          precio_nuevo?: number
          realizado_por?: string | null
          saldo_aplicado?: number
          suscripcion_anterior_id?: string
          suscripcion_nueva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambios_plan_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "cambios_plan_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "cambios_plan_plan_anterior_id_fkey"
            columns: ["plan_anterior_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_plan_anterior_id_fkey"
            columns: ["plan_anterior_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_plan_nuevo_id_fkey"
            columns: ["plan_nuevo_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_plan_nuevo_id_fkey"
            columns: ["plan_nuevo_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_anterior_id_fkey"
            columns: ["suscripcion_anterior_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_anterior_id_fkey"
            columns: ["suscripcion_anterior_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["obligacion_id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_anterior_id_fkey"
            columns: ["suscripcion_anterior_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["pago_id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_anterior_id_fkey"
            columns: ["suscripcion_anterior_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_1_id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_anterior_id_fkey"
            columns: ["suscripcion_anterior_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_2_id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_nueva_id_fkey"
            columns: ["suscripcion_nueva_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_nueva_id_fkey"
            columns: ["suscripcion_nueva_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["obligacion_id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_nueva_id_fkey"
            columns: ["suscripcion_nueva_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["pago_id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_nueva_id_fkey"
            columns: ["suscripcion_nueva_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_1_id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_nueva_id_fkey"
            columns: ["suscripcion_nueva_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_2_id"]
          },
        ]
      }
      cierres_caja_diarios: {
        Row: {
          cerrado_at: string | null
          cerrado_por: string | null
          created_at: string
          diferencia_escuela: number | null
          diferencia_tienda: number | null
          diferencia_total: number | null
          diferencia_viajes: number | null
          efectivo_escuela_contado: number | null
          efectivo_escuela_sistema: number
          efectivo_tienda_contado: number | null
          efectivo_tienda_sistema: number
          efectivo_viajes_contado: number | null
          efectivo_viajes_sistema: number
          estado: string
          fecha: string
          huerfanos_count: number | null
          huerfanos_monto: number | null
          id: string
          mp_app_total: number | null
          mp_banco_total: number | null
          notas: string | null
          transfer_app_total: number | null
          updated_at: string
        }
        Insert: {
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          diferencia_escuela?: number | null
          diferencia_tienda?: number | null
          diferencia_total?: number | null
          diferencia_viajes?: number | null
          efectivo_escuela_contado?: number | null
          efectivo_escuela_sistema?: number
          efectivo_tienda_contado?: number | null
          efectivo_tienda_sistema?: number
          efectivo_viajes_contado?: number | null
          efectivo_viajes_sistema?: number
          estado?: string
          fecha: string
          huerfanos_count?: number | null
          huerfanos_monto?: number | null
          id?: string
          mp_app_total?: number | null
          mp_banco_total?: number | null
          notas?: string | null
          transfer_app_total?: number | null
          updated_at?: string
        }
        Update: {
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          diferencia_escuela?: number | null
          diferencia_tienda?: number | null
          diferencia_total?: number | null
          diferencia_viajes?: number | null
          efectivo_escuela_contado?: number | null
          efectivo_escuela_sistema?: number
          efectivo_tienda_contado?: number | null
          efectivo_tienda_sistema?: number
          efectivo_viajes_contado?: number | null
          efectivo_viajes_sistema?: number
          estado?: string
          fecha?: string
          huerfanos_count?: number | null
          huerfanos_monto?: number | null
          id?: string
          mp_app_total?: number | null
          mp_banco_total?: number | null
          notas?: string | null
          transfer_app_total?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      clases_consumidas: {
        Row: {
          alumno_id: string
          coach_id: string | null
          creada_por: string | null
          created_at: string
          fecha: string
          id: string
          notas: string | null
          reserva_id: string | null
          suscripcion_id: string
          updated_at: string
        }
        Insert: {
          alumno_id: string
          coach_id?: string | null
          creada_por?: string | null
          created_at?: string
          fecha?: string
          id?: string
          notas?: string | null
          reserva_id?: string | null
          suscripcion_id: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          coach_id?: string | null
          creada_por?: string | null
          created_at?: string
          fecha?: string
          id?: string
          notas?: string | null
          reserva_id?: string | null
          suscripcion_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clases_consumidas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_consumidas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "clases_consumidas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "clases_consumidas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_consumidas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_consumidas_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_consumidas_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["obligacion_id"]
          },
          {
            foreignKeyName: "clases_consumidas_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["pago_id"]
          },
          {
            foreignKeyName: "clases_consumidas_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_1_id"]
          },
          {
            foreignKeyName: "clases_consumidas_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_2_id"]
          },
        ]
      }
      clases_dictadas: {
        Row: {
          agenda_id: string | null
          asistencia_cargada: boolean
          cantidad_asistentes: number | null
          coach_id: string
          created_at: string
          fecha: string
          foto_grupal_url: string | null
          honorario_id: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          movimiento_id: string | null
          notas: string | null
          sede_id: string | null
          updated_at: string
        }
        Insert: {
          agenda_id?: string | null
          asistencia_cargada?: boolean
          cantidad_asistentes?: number | null
          coach_id: string
          created_at?: string
          fecha: string
          foto_grupal_url?: string | null
          honorario_id?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          movimiento_id?: string | null
          notas?: string | null
          sede_id?: string | null
          updated_at?: string
        }
        Update: {
          agenda_id?: string | null
          asistencia_cargada?: boolean
          cantidad_asistentes?: number | null
          coach_id?: string
          created_at?: string
          fecha?: string
          foto_grupal_url?: string | null
          honorario_id?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          movimiento_id?: string | null
          notas?: string | null
          sede_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clases_dictadas_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "agenda_grupal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_dictadas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_dictadas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_dictadas_honorario_id_fkey"
            columns: ["honorario_id"]
            isOneToOne: false
            referencedRelation: "honorarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_dictadas_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_liquidacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clases_dictadas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
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
          sede_id: string | null
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
          sede_id?: string | null
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
          sede_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaches_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      cuenta_ajustes: {
        Row: {
          alumno_id: string
          aplicado_a_fuente_id: string | null
          aplicado_a_fuente_tabla: string | null
          comprobante_url: string | null
          concepto: string
          created_at: string
          created_by: string | null
          cuenta_mp_id: string | null
          fecha: string
          id: string
          medio_pago: string | null
          moneda: string
          monto: number
          notas: string | null
          referencia_externa: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          alumno_id: string
          aplicado_a_fuente_id?: string | null
          aplicado_a_fuente_tabla?: string | null
          comprobante_url?: string | null
          concepto: string
          created_at?: string
          created_by?: string | null
          cuenta_mp_id?: string | null
          fecha?: string
          id?: string
          medio_pago?: string | null
          moneda?: string
          monto: number
          notas?: string | null
          referencia_externa?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          aplicado_a_fuente_id?: string | null
          aplicado_a_fuente_tabla?: string | null
          comprobante_url?: string | null
          concepto?: string
          created_at?: string
          created_by?: string | null
          cuenta_mp_id?: string | null
          fecha?: string
          id?: string
          medio_pago?: string | null
          moneda?: string
          monto?: number
          notas?: string | null
          referencia_externa?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_ajustes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuenta_ajustes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "cuenta_ajustes_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "cuenta_ajustes_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
        ]
      }
      cuenta_corriente_tokens: {
        Row: {
          access_count: number
          alumno_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          last_ip: string | null
          last_user_agent: string | null
          revoked_at: string | null
          revoked_by: string | null
          token: string
        }
        Insert: {
          access_count?: number
          alumno_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          last_ip?: string | null
          last_user_agent?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token?: string
        }
        Update: {
          access_count?: number
          alumno_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          last_ip?: string | null
          last_user_agent?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_corriente_tokens_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuenta_corriente_tokens_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "cuenta_corriente_tokens_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      cuenta_mp_routing: {
        Row: {
          activa: boolean
          created_at: string
          cuenta_mp_id: string
          emisor_fiscal_id: string | null
          id: string
          notas: string | null
          prioridad: number
          unidad_negocio: Database["public"]["Enums"]["unidad_negocio_mp"]
          updated_at: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          cuenta_mp_id: string
          emisor_fiscal_id?: string | null
          id?: string
          notas?: string | null
          prioridad?: number
          unidad_negocio: Database["public"]["Enums"]["unidad_negocio_mp"]
          updated_at?: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          cuenta_mp_id?: string
          emisor_fiscal_id?: string | null
          id?: string
          notas?: string | null
          prioridad?: number
          unidad_negocio?: Database["public"]["Enums"]["unidad_negocio_mp"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_mp_routing_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuenta_mp_routing_emisor_fiscal_id_fkey"
            columns: ["emisor_fiscal_id"]
            isOneToOne: false
            referencedRelation: "emisor_facturado_anual"
            referencedColumns: ["emisor_id"]
          },
          {
            foreignKeyName: "cuenta_mp_routing_emisor_fiscal_id_fkey"
            columns: ["emisor_fiscal_id"]
            isOneToOne: false
            referencedRelation: "emisores_fiscales"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_mp: {
        Row: {
          activa: boolean
          created_at: string
          emisor_fiscal_default_id: string | null
          es_default_global: boolean
          id: string
          limite_mensual_ars: number | null
          modo: Database["public"]["Enums"]["modo_mp"]
          nombre: string
          notas: string | null
          secret_name_pubkey: string | null
          secret_name_token: string
          secret_name_webhook: string | null
          slug: string
          tiene_secrets: boolean | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          emisor_fiscal_default_id?: string | null
          es_default_global?: boolean
          id?: string
          limite_mensual_ars?: number | null
          modo?: Database["public"]["Enums"]["modo_mp"]
          nombre: string
          notas?: string | null
          secret_name_pubkey?: string | null
          secret_name_token: string
          secret_name_webhook?: string | null
          slug: string
          tiene_secrets?: boolean | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          emisor_fiscal_default_id?: string | null
          es_default_global?: boolean
          id?: string
          limite_mensual_ars?: number | null
          modo?: Database["public"]["Enums"]["modo_mp"]
          nombre?: string
          notas?: string | null
          secret_name_pubkey?: string | null
          secret_name_token?: string
          secret_name_webhook?: string | null
          slug?: string
          tiene_secrets?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_mp_emisor_fiscal_default_id_fkey"
            columns: ["emisor_fiscal_default_id"]
            isOneToOne: false
            referencedRelation: "emisor_facturado_anual"
            referencedColumns: ["emisor_id"]
          },
          {
            foreignKeyName: "cuentas_mp_emisor_fiscal_default_id_fkey"
            columns: ["emisor_fiscal_default_id"]
            isOneToOne: false
            referencedRelation: "emisores_fiscales"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_item_check_log: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          cantidad: number | null
          cliente_nombre: string
          created_at: string
          id: string
          item_id: string | null
          list_id: string
          preparado: boolean
          producto: string
          variante: string | null
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          cantidad?: number | null
          cliente_nombre: string
          created_at?: string
          id?: string
          item_id?: string | null
          list_id: string
          preparado: boolean
          producto: string
          variante?: string | null
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          cantidad?: number | null
          cliente_nombre?: string
          created_at?: string
          id?: string
          item_id?: string | null
          list_id?: string
          preparado?: boolean
          producto?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_item_check_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "delivery_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_item_check_log_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "delivery_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_list_items: {
        Row: {
          alumno_id: string | null
          aviso_retiro_channel: string | null
          aviso_retiro_enviado_at: string | null
          aviso_retiro_enviado_por: string | null
          cantidad: number
          cliente_alumno_id: string | null
          cliente_nombre: string
          costo_unitario: number | null
          created_at: string
          id: string
          list_id: string
          modalidad_retiro: string | null
          moneda: string
          notas: string | null
          posicion: number
          precio_venta: number | null
          preparado: boolean
          preparado_at: string | null
          preparado_by: string | null
          producto: string
          sede_retiro_id: string | null
          source_order_id: string | null
          source_order_item_id: string | null
          source_preorder_id: string | null
          source_type: string | null
          store_product_id: string | null
          updated_at: string
          variante: string | null
        }
        Insert: {
          alumno_id?: string | null
          aviso_retiro_channel?: string | null
          aviso_retiro_enviado_at?: string | null
          aviso_retiro_enviado_por?: string | null
          cantidad?: number
          cliente_alumno_id?: string | null
          cliente_nombre: string
          costo_unitario?: number | null
          created_at?: string
          id?: string
          list_id: string
          modalidad_retiro?: string | null
          moneda?: string
          notas?: string | null
          posicion?: number
          precio_venta?: number | null
          preparado?: boolean
          preparado_at?: string | null
          preparado_by?: string | null
          producto: string
          sede_retiro_id?: string | null
          source_order_id?: string | null
          source_order_item_id?: string | null
          source_preorder_id?: string | null
          source_type?: string | null
          store_product_id?: string | null
          updated_at?: string
          variante?: string | null
        }
        Update: {
          alumno_id?: string | null
          aviso_retiro_channel?: string | null
          aviso_retiro_enviado_at?: string | null
          aviso_retiro_enviado_por?: string | null
          cantidad?: number
          cliente_alumno_id?: string | null
          cliente_nombre?: string
          costo_unitario?: number | null
          created_at?: string
          id?: string
          list_id?: string
          modalidad_retiro?: string | null
          moneda?: string
          notas?: string | null
          posicion?: number
          precio_venta?: number | null
          preparado?: boolean
          preparado_at?: string | null
          preparado_by?: string | null
          producto?: string
          sede_retiro_id?: string | null
          source_order_id?: string | null
          source_order_item_id?: string | null
          source_preorder_id?: string | null
          source_type?: string | null
          store_product_id?: string | null
          updated_at?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_list_items_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_list_items_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "delivery_list_items_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "delivery_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "delivery_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_list_items_sede_retiro_id_fkey"
            columns: ["sede_retiro_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_list_items_store_product_id_fkey"
            columns: ["store_product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_list_payments: {
        Row: {
          cargado_por_email: string | null
          cargado_por_nombre: string | null
          cargado_por_user_id: string | null
          cliente_nombre: string
          comprobante_path: string | null
          created_at: string
          forma_pago: string
          forma_pago_esperada: string | null
          id: string
          list_id: string
          moneda: string
          moneda_esperada: string | null
          monto: number
          monto_esperado: number | null
          notas: string | null
          origen: string
          rechazado: boolean
          rechazado_at: string | null
          rechazado_motivo: string | null
          rechazado_por: string | null
          updated_at: string
          validado: boolean
          validado_at: string | null
          validado_notas: string | null
          validado_por: string | null
        }
        Insert: {
          cargado_por_email?: string | null
          cargado_por_nombre?: string | null
          cargado_por_user_id?: string | null
          cliente_nombre: string
          comprobante_path?: string | null
          created_at?: string
          forma_pago: string
          forma_pago_esperada?: string | null
          id?: string
          list_id: string
          moneda?: string
          moneda_esperada?: string | null
          monto: number
          monto_esperado?: number | null
          notas?: string | null
          origen?: string
          rechazado?: boolean
          rechazado_at?: string | null
          rechazado_motivo?: string | null
          rechazado_por?: string | null
          updated_at?: string
          validado?: boolean
          validado_at?: string | null
          validado_notas?: string | null
          validado_por?: string | null
        }
        Update: {
          cargado_por_email?: string | null
          cargado_por_nombre?: string | null
          cargado_por_user_id?: string | null
          cliente_nombre?: string
          comprobante_path?: string | null
          created_at?: string
          forma_pago?: string
          forma_pago_esperada?: string | null
          id?: string
          list_id?: string
          moneda?: string
          moneda_esperada?: string | null
          monto?: number
          monto_esperado?: number | null
          notas?: string | null
          origen?: string
          rechazado?: boolean
          rechazado_at?: string | null
          rechazado_motivo?: string | null
          rechazado_por?: string | null
          updated_at?: string
          validado?: boolean
          validado_at?: string | null
          validado_notas?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_list_payments_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "delivery_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_lists: {
        Row: {
          caja_abierta_at: string | null
          caja_abierta_por: string | null
          caja_cerrada_at: string | null
          caja_cerrada_por: string | null
          caja_estado: string
          costo_total_mercaderia: number | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          estado: string
          fecha_entrega: string | null
          id: string
          moneda_costo: string | null
          notas_cierre: string | null
          origen: string
          pagado_a_proveedor: number | null
          proveedor_nombre: string | null
          public_editable: boolean
          public_token: string
          tc_usd: number | null
          titulo: string
          updated_at: string
        }
        Insert: {
          caja_abierta_at?: string | null
          caja_abierta_por?: string | null
          caja_cerrada_at?: string | null
          caja_cerrada_por?: string | null
          caja_estado?: string
          costo_total_mercaderia?: number | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estado?: string
          fecha_entrega?: string | null
          id?: string
          moneda_costo?: string | null
          notas_cierre?: string | null
          origen?: string
          pagado_a_proveedor?: number | null
          proveedor_nombre?: string | null
          public_editable?: boolean
          public_token?: string
          tc_usd?: number | null
          titulo: string
          updated_at?: string
        }
        Update: {
          caja_abierta_at?: string | null
          caja_abierta_por?: string | null
          caja_cerrada_at?: string | null
          caja_cerrada_por?: string | null
          caja_estado?: string
          costo_total_mercaderia?: number | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estado?: string
          fecha_entrega?: string | null
          id?: string
          moneda_costo?: string | null
          notas_cierre?: string | null
          origen?: string
          pagado_a_proveedor?: number | null
          proveedor_nombre?: string | null
          public_editable?: boolean
          public_token?: string
          tc_usd?: number | null
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_supplier_payments: {
        Row: {
          categoria: string
          comprobante_url: string | null
          concepto: string | null
          created_at: string
          delivery_list_id: string
          fecha: string
          id: string
          metodo: string
          moneda: string
          monto: number
          notas: string | null
          registrado_por: string | null
          registrado_por_nombre: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string
          comprobante_url?: string | null
          concepto?: string | null
          created_at?: string
          delivery_list_id: string
          fecha?: string
          id?: string
          metodo?: string
          moneda?: string
          monto: number
          notas?: string | null
          registrado_por?: string | null
          registrado_por_nombre?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string
          comprobante_url?: string | null
          concepto?: string | null
          created_at?: string
          delivery_list_id?: string
          fecha?: string
          id?: string
          metodo?: string
          moneda?: string
          monto?: number
          notas?: string | null
          registrado_por?: string | null
          registrado_por_nombre?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_supplier_payments_delivery_list_id_fkey"
            columns: ["delivery_list_id"]
            isOneToOne: false
            referencedRelation: "delivery_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      deposito_profiles: {
        Row: {
          created_at: string
          email: string
          estado: string
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
      descuentos: {
        Row: {
          activo: boolean
          aplica_a: string
          categoria: string
          codigo: string | null
          created_at: string
          evento_id: string | null
          id: string
          max_usos: number | null
          nombre: string
          tipo: string
          updated_at: string
          usos_actuales: number
          valor: number
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          activo?: boolean
          aplica_a?: string
          categoria?: string
          codigo?: string | null
          created_at?: string
          evento_id?: string | null
          id?: string
          max_usos?: number | null
          nombre: string
          tipo?: string
          updated_at?: string
          usos_actuales?: number
          valor?: number
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          activo?: boolean
          aplica_a?: string
          categoria?: string
          codigo?: string | null
          created_at?: string
          evento_id?: string | null
          id?: string
          max_usos?: number | null
          nombre?: string
          tipo?: string
          updated_at?: string
          usos_actuales?: number
          valor?: number
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "descuentos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      descuentos_alumno: {
        Row: {
          activo: boolean
          alumno_id: string
          asignado_por: string | null
          created_at: string
          descuento_id: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          nota: string | null
          origen: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          alumno_id: string
          asignado_por?: string | null
          created_at?: string
          descuento_id: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          nota?: string | null
          origen?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          alumno_id?: string
          asignado_por?: string | null
          created_at?: string
          descuento_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          nota?: string | null
          origen?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "descuentos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descuentos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "descuentos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "descuentos_alumno_descuento_id_fkey"
            columns: ["descuento_id"]
            isOneToOne: false
            referencedRelation: "descuentos"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          ajuste_id: string | null
          alumno_id: string
          baja_solicitud_id: string | null
          created_at: string
          created_by: string | null
          fecha: string
          id: string
          metodo: string
          moneda: string
          monto: number
          motivo: string
          notas: string | null
          referencia: string | null
          suscripcion_id: string | null
          updated_at: string
        }
        Insert: {
          ajuste_id?: string | null
          alumno_id: string
          baja_solicitud_id?: string | null
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          metodo?: string
          moneda?: string
          monto: number
          motivo: string
          notas?: string | null
          referencia?: string | null
          suscripcion_id?: string | null
          updated_at?: string
        }
        Update: {
          ajuste_id?: string | null
          alumno_id?: string
          baja_solicitud_id?: string | null
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          metodo?: string
          moneda?: string
          monto?: number
          motivo?: string
          notas?: string | null
          referencia?: string | null
          suscripcion_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_ajuste_id_fkey"
            columns: ["ajuste_id"]
            isOneToOne: false
            referencedRelation: "cuenta_ajustes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "devoluciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "devoluciones_baja_solicitud_id_fkey"
            columns: ["baja_solicitud_id"]
            isOneToOne: false
            referencedRelation: "bajas_solicitudes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["obligacion_id"]
          },
          {
            foreignKeyName: "devoluciones_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["pago_id"]
          },
          {
            foreignKeyName: "devoluciones_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_1_id"]
          },
          {
            foreignKeyName: "devoluciones_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_2_id"]
          },
        ]
      }
      disponibilidad_ajustada: {
        Row: {
          coach_id: string | null
          creado_por: string | null
          created_at: string
          fecha: string
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          motivo: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          coach_id?: string | null
          creado_por?: string | null
          created_at?: string
          fecha: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          coach_id?: string | null
          creado_por?: string | null
          created_at?: string
          fecha?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidad_ajustada_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_ajustada_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidad_coaches: {
        Row: {
          activo: boolean
          coach_id: string
          created_at: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          sede_id: string | null
          servicio_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coach_id: string
          created_at?: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          sede_id?: string | null
          servicio_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coach_id?: string
          created_at?: string
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          sede_id?: string | null
          servicio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidad_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_coaches_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_coaches_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_turnera"
            referencedColumns: ["id"]
          },
        ]
      }
      email_dlq_decisions: {
        Row: {
          decided_at: string
          decided_by: string | null
          decision: string
          id: string
          message_id: string | null
          original_error: string | null
          reason: string | null
          recipient_email: string | null
          template_name: string | null
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          message_id?: string | null
          original_error?: string | null
          reason?: string | null
          recipient_email?: string | null
          template_name?: string | null
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          message_id?: string | null
          original_error?: string | null
          reason?: string | null
          recipient_email?: string | null
          template_name?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          html_body: string
          is_active: boolean
          key: string
          required_variables: Json
          subject: string
          text_body: string | null
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
          variables: Json
          wired: boolean
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          html_body: string
          is_active?: boolean
          key: string
          required_variables?: Json
          subject: string
          text_body?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
          variables?: Json
          wired?: boolean
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          html_body?: string
          is_active?: boolean
          key?: string
          required_variables?: Json
          subject?: string
          text_body?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
          variables?: Json
          wired?: boolean
        }
        Relationships: []
      }
      email_templates_versions: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          html_body: string
          id: string
          note: string | null
          subject: string
          template_key: string
          text_body: string | null
          version_number: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          html_body: string
          id?: string
          note?: string | null
          subject: string
          template_key: string
          text_body?: string | null
          version_number: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          html_body?: string
          id?: string
          note?: string | null
          subject?: string
          template_key?: string
          text_body?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_versions_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emisor_segmento_config: {
        Row: {
          created_at: string
          emisor_id: string
          habilitado: boolean
          id: string
          segmento: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          emisor_id: string
          habilitado?: boolean
          id?: string
          segmento: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          emisor_id?: string
          habilitado?: boolean
          id?: string
          segmento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emisor_segmento_config_emisor_id_fkey"
            columns: ["emisor_id"]
            isOneToOne: false
            referencedRelation: "emisor_facturado_anual"
            referencedColumns: ["emisor_id"]
          },
          {
            foreignKeyName: "emisor_segmento_config_emisor_id_fkey"
            columns: ["emisor_id"]
            isOneToOne: false
            referencedRelation: "emisores_fiscales"
            referencedColumns: ["id"]
          },
        ]
      }
      emisores_fiscales: {
        Row: {
          activo: boolean
          auto_facturar_origenes: string[]
          categoria_monotributo: string | null
          cert_pem: string | null
          condicion_iva: string | null
          created_at: string
          cuit: string
          domicilio_comercial: string | null
          email_contacto: string | null
          es_predeterminado: boolean
          facturacion_automatica: boolean
          id: string
          ingresos_brutos: string | null
          inicio_actividades: string | null
          key_pem: string | null
          limite_anual_ars: number | null
          logo_url: string | null
          nombre_fiscal: string
          punto_venta: number
          telefono_contacto: string | null
          tiene_credenciales: boolean | null
          updated_at: string
          website: string | null
        }
        Insert: {
          activo?: boolean
          auto_facturar_origenes?: string[]
          categoria_monotributo?: string | null
          cert_pem?: string | null
          condicion_iva?: string | null
          created_at?: string
          cuit: string
          domicilio_comercial?: string | null
          email_contacto?: string | null
          es_predeterminado?: boolean
          facturacion_automatica?: boolean
          id?: string
          ingresos_brutos?: string | null
          inicio_actividades?: string | null
          key_pem?: string | null
          limite_anual_ars?: number | null
          logo_url?: string | null
          nombre_fiscal: string
          punto_venta?: number
          telefono_contacto?: string | null
          tiene_credenciales?: boolean | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          activo?: boolean
          auto_facturar_origenes?: string[]
          categoria_monotributo?: string | null
          cert_pem?: string | null
          condicion_iva?: string | null
          created_at?: string
          cuit?: string
          domicilio_comercial?: string | null
          email_contacto?: string | null
          es_predeterminado?: boolean
          facturacion_automatica?: boolean
          id?: string
          ingresos_brutos?: string | null
          inicio_actividades?: string | null
          key_pem?: string | null
          limite_anual_ars?: number | null
          logo_url?: string | null
          nombre_fiscal?: string
          punto_venta?: number
          telefono_contacto?: string | null
          tiene_credenciales?: boolean | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      entrenamientos: {
        Row: {
          alumno_id: string | null
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
          alumno_id?: string | null
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
          alumno_id?: string | null
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
            foreignKeyName: "entrenamientos_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrenamientos_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "entrenamientos_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
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
            foreignKeyName: "entrenamientos_realizados_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "entrenamientos_realizados_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
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
      event_accommodation_waitlist_requests: {
        Row: {
          alumno_id: string | null
          created_at: string
          estado: string
          event_id: string
          genero_preferido: string | null
          id: string
          nota_admin: string | null
          nota_alumno: string | null
          package_id: string
          prospect_email: string | null
          prospect_nombre: string | null
          prospect_telefono: string | null
          reservation_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          created_at?: string
          estado?: string
          event_id: string
          genero_preferido?: string | null
          id?: string
          nota_admin?: string | null
          nota_alumno?: string | null
          package_id: string
          prospect_email?: string | null
          prospect_nombre?: string | null
          prospect_telefono?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          created_at?: string
          estado?: string
          event_id?: string
          genero_preferido?: string | null
          id?: string
          nota_admin?: string | null
          nota_alumno?: string | null
          package_id?: string
          prospect_email?: string | null
          prospect_nombre?: string | null
          prospect_telefono?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_accommodation_waitlist_requests_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_accommodation_waitlist_requests_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_accommodation_waitlist_requests_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "event_accommodation_waitlist_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_accommodation_waitlist_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_accommodation_waitlist_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_accommodation_waitlist_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      event_addons: {
        Row: {
          activo: boolean
          created_at: string
          currency: string
          descripcion: string | null
          event_id: string
          id: string
          max_por_participante: number | null
          nombre: string
          precio: number
          sort_order: number
          stock_total: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          currency?: string
          descripcion?: string | null
          event_id: string
          id?: string
          max_por_participante?: number | null
          nombre: string
          precio?: number
          sort_order?: number
          stock_total?: number | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          currency?: string
          descripcion?: string | null
          event_id?: string
          id?: string
          max_por_participante?: number | null
          nombre?: string
          precio?: number
          sort_order?: number
          stock_total?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_addons_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_announcements: {
        Row: {
          category: string
          content: string
          created_at: string
          email_recipients_count: number
          email_sent_at: string | null
          event_id: string
          id: string
          is_highlighted: boolean
          published_at: string
          send_email_on_publish: boolean
          sort_order: number
          title: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          email_recipients_count?: number
          email_sent_at?: string | null
          event_id: string
          id?: string
          is_highlighted?: boolean
          published_at?: string
          send_email_on_publish?: boolean
          sort_order?: number
          title: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          email_recipients_count?: number
          email_sent_at?: string | null
          event_id?: string
          id?: string
          is_highlighted?: boolean
          published_at?: string
          send_email_on_publish?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_announcements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cost_actuals: {
        Row: {
          categoria: string
          created_at: string
          descripcion: string
          fuente: string
          gasto_id: string | null
          id: string
          moneda: string
          monto_real: number
          notas: string | null
          simulation_id: string
          updated_at: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          descripcion?: string
          fuente?: string
          gasto_id?: string | null
          id?: string
          moneda?: string
          monto_real?: number
          notas?: string | null
          simulation_id: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          descripcion?: string
          fuente?: string
          gasto_id?: string | null
          id?: string
          moneda?: string
          monto_real?: number
          notas?: string | null
          simulation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cost_actuals_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cost_actuals_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "event_cost_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cost_items: {
        Row: {
          aplica_a_modalidades: Json
          cantidad: number
          categoria: string
          created_at: string
          descripcion: string
          detalle: Json
          es_por_persona: boolean
          grupo_costo: string | null
          id: string
          moneda: string
          orden: number
          precio_unitario: number
          simulation_id: string
          updated_at: string
        }
        Insert: {
          aplica_a_modalidades?: Json
          cantidad?: number
          categoria?: string
          created_at?: string
          descripcion?: string
          detalle?: Json
          es_por_persona?: boolean
          grupo_costo?: string | null
          id?: string
          moneda?: string
          orden?: number
          precio_unitario?: number
          simulation_id: string
          updated_at?: string
        }
        Update: {
          aplica_a_modalidades?: Json
          cantidad?: number
          categoria?: string
          created_at?: string
          descripcion?: string
          detalle?: Json
          es_por_persona?: boolean
          grupo_costo?: string | null
          id?: string
          moneda?: string
          orden?: number
          precio_unitario?: number
          simulation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cost_items_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "event_cost_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cost_simulations: {
        Row: {
          aplicada_a_packages_at: string | null
          cantidades_esperadas: Json
          capacidad_total: number
          created_at: string
          created_by: string | null
          escenario_activo_id: string | null
          escenarios_inscripcion: Json
          estado: string
          event_id: string
          honorario_por_participante: number
          id: string
          jornadas: number
          moneda_base: string
          noches: number
          nombre: string | null
          notas: string | null
          pct_imprevistos: number
          pct_margen_objetivo: number
          rentabilidad_modo: string
          resultados: Json
          resultados_reales: Json
          tc_eur: number
          tc_usd: number
          updated_at: string
          version: number
        }
        Insert: {
          aplicada_a_packages_at?: string | null
          cantidades_esperadas?: Json
          capacidad_total?: number
          created_at?: string
          created_by?: string | null
          escenario_activo_id?: string | null
          escenarios_inscripcion?: Json
          estado?: string
          event_id: string
          honorario_por_participante?: number
          id?: string
          jornadas?: number
          moneda_base?: string
          noches?: number
          nombre?: string | null
          notas?: string | null
          pct_imprevistos?: number
          pct_margen_objetivo?: number
          rentabilidad_modo?: string
          resultados?: Json
          resultados_reales?: Json
          tc_eur?: number
          tc_usd?: number
          updated_at?: string
          version: number
        }
        Update: {
          aplicada_a_packages_at?: string | null
          cantidades_esperadas?: Json
          capacidad_total?: number
          created_at?: string
          created_by?: string | null
          escenario_activo_id?: string | null
          escenarios_inscripcion?: Json
          estado?: string
          event_id?: string
          honorario_por_participante?: number
          id?: string
          jornadas?: number
          moneda_base?: string
          noches?: number
          nombre?: string | null
          notas?: string | null
          pct_imprevistos?: number
          pct_margen_objetivo?: number
          rentabilidad_modo?: string
          resultados?: Json
          resultados_reales?: Json
          tc_eur?: number
          tc_usd?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_cost_simulations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_external_participants: {
        Row: {
          access_token: string
          apellido: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_telefono: string | null
          created_at: string
          documento: string | null
          email: string
          estado: string
          fecha_nacimiento: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string
          apellido?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          documento?: string | null
          email: string
          estado?: string
          fecha_nacimiento?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          apellido?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          documento?: string | null
          email?: string
          estado?: string
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_favorites: {
        Row: {
          alumno_id: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_favorites_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_favorites_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_favorites_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "event_favorites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_installments: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          event_id: string
          external_payment_url_template: string | null
          id: string
          label: string
          number: number
          payment_method_hint: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          created_at?: string
          currency: string
          description?: string | null
          due_date?: string | null
          event_id: string
          external_payment_url_template?: string | null
          id?: string
          label: string
          number: number
          payment_method_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          event_id?: string
          external_payment_url_template?: string | null
          id?: string
          label?: string
          number?: number
          payment_method_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_installments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_package_change_requests: {
        Row: {
          alumno_id: string | null
          applied_at: string | null
          created_at: string
          estado: string
          event_id: string
          expires_at: string | null
          id: string
          motivo_alumno: string | null
          nota_admin: string | null
          override_plaza_libre: boolean
          package_actual_id: string | null
          package_nuevo_id: string
          preview_snapshot: Json | null
          requested_by: string | null
          reservation_id: string
          resolved_at: string | null
          resolved_by: string | null
          roommate_propuesto_id: string | null
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          applied_at?: string | null
          created_at?: string
          estado?: string
          event_id: string
          expires_at?: string | null
          id?: string
          motivo_alumno?: string | null
          nota_admin?: string | null
          override_plaza_libre?: boolean
          package_actual_id?: string | null
          package_nuevo_id: string
          preview_snapshot?: Json | null
          requested_by?: string | null
          reservation_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          roommate_propuesto_id?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          applied_at?: string | null
          created_at?: string
          estado?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          motivo_alumno?: string | null
          nota_admin?: string | null
          override_plaza_libre?: boolean
          package_actual_id?: string | null
          package_nuevo_id?: string
          preview_snapshot?: Json | null
          requested_by?: string | null
          reservation_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          roommate_propuesto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_package_change_requests_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_package_change_requests_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_package_change_requests_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "event_package_change_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_package_change_requests_package_actual_id_fkey"
            columns: ["package_actual_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_package_change_requests_package_nuevo_id_fkey"
            columns: ["package_nuevo_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_package_change_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_package_change_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
          {
            foreignKeyName: "event_package_change_requests_roommate_propuesto_id_fkey"
            columns: ["roommate_propuesto_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_package_change_requests_roommate_propuesto_id_fkey"
            columns: ["roommate_propuesto_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_package_change_requests_roommate_propuesto_id_fkey"
            columns: ["roommate_propuesto_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      event_package_payment_plan_installments: {
        Row: {
          created_at: string
          descripcion: string | null
          fecha_vencimiento: string | null
          id: string
          monto_tipo: Database["public"]["Enums"]["payment_plan_monto_tipo"]
          monto_valor: number
          numero: number
          plan_id: string
          reminders_config: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          monto_tipo?: Database["public"]["Enums"]["payment_plan_monto_tipo"]
          monto_valor?: number
          numero: number
          plan_id: string
          reminders_config?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          monto_tipo?: Database["public"]["Enums"]["payment_plan_monto_tipo"]
          monto_valor?: number
          numero?: number
          plan_id?: string
          reminders_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_package_payment_plan_installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "event_package_payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      event_package_payment_plans: {
        Row: {
          activo: boolean
          archived_at: string | null
          cantidad_cuotas: number
          created_at: string
          id: string
          last_installment_absorbs_rounding: boolean
          nombre: string
          package_id: string
          price_stage_id: string | null
          regla_reserva_tardia: Database["public"]["Enums"]["payment_plan_regla_tardia"]
          sena_tipo: Database["public"]["Enums"]["payment_plan_sena_tipo"]
          sena_valor: number
          sena_vence_dias: number
          updated_at: string
          version: number
        }
        Insert: {
          activo?: boolean
          archived_at?: string | null
          cantidad_cuotas?: number
          created_at?: string
          id?: string
          last_installment_absorbs_rounding?: boolean
          nombre?: string
          package_id: string
          price_stage_id?: string | null
          regla_reserva_tardia?: Database["public"]["Enums"]["payment_plan_regla_tardia"]
          sena_tipo?: Database["public"]["Enums"]["payment_plan_sena_tipo"]
          sena_valor?: number
          sena_vence_dias?: number
          updated_at?: string
          version?: number
        }
        Update: {
          activo?: boolean
          archived_at?: string | null
          cantidad_cuotas?: number
          created_at?: string
          id?: string
          last_installment_absorbs_rounding?: boolean
          nombre?: string
          package_id?: string
          price_stage_id?: string | null
          regla_reserva_tardia?: Database["public"]["Enums"]["payment_plan_regla_tardia"]
          sena_tipo?: Database["public"]["Enums"]["payment_plan_sena_tipo"]
          sena_valor?: number
          sena_vence_dias?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_package_payment_plans_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_package_payment_plans_price_stage_id_fkey"
            columns: ["price_stage_id"]
            isOneToOne: false
            referencedRelation: "event_package_price_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      event_package_price_stages: {
        Row: {
          activo: boolean
          created_at: string
          currency: string
          id: string
          incremento_pct: number | null
          nombre: string
          package_id: string
          precio: number
          sort_order: number
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          currency?: string
          id?: string
          incremento_pct?: number | null
          nombre: string
          package_id: string
          precio: number
          sort_order?: number
          updated_at?: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          currency?: string
          id?: string
          incremento_pct?: number | null
          nombre?: string
          package_id?: string
          precio?: number
          sort_order?: number
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_package_price_stages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      event_packages: {
        Row: {
          activo: boolean
          created_at: string
          cupo: number | null
          cupo_mixto: number | null
          cupo_mujeres: number | null
          cupo_varones: number | null
          currency: string
          descripcion: string | null
          event_id: string
          id: string
          lodging_group_key: string | null
          nombre: string
          permite_mixto: boolean
          personas_por_habitacion: number
          precio: number
          sena: number | null
          sin_alojamiento: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cupo?: number | null
          cupo_mixto?: number | null
          cupo_mujeres?: number | null
          cupo_varones?: number | null
          currency?: string
          descripcion?: string | null
          event_id: string
          id?: string
          lodging_group_key?: string | null
          nombre: string
          permite_mixto?: boolean
          personas_por_habitacion?: number
          precio: number
          sena?: number | null
          sin_alojamiento?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          cupo?: number | null
          cupo_mixto?: number | null
          cupo_mujeres?: number | null
          cupo_varones?: number | null
          currency?: string
          descripcion?: string | null
          event_id?: string
          id?: string
          lodging_group_key?: string | null
          nombre?: string
          permite_mixto?: boolean
          personas_por_habitacion?: number
          precio?: number
          sena?: number | null
          sin_alojamiento?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_packages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          checked_in_at: string | null
          created_at: string
          email: string
          event_id: string | null
          event_reservation_id: string | null
          event_slug: string
          evidence_url: string | null
          first_name: string
          id: string
          last_name: string
          last_request_email_sent_at: string | null
          package_id: string | null
          package_nombre_snapshot: string | null
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
          checked_in_at?: string | null
          created_at?: string
          email: string
          event_id?: string | null
          event_reservation_id?: string | null
          event_slug?: string
          evidence_url?: string | null
          first_name: string
          id?: string
          last_name: string
          last_request_email_sent_at?: string | null
          package_id?: string | null
          package_nombre_snapshot?: string | null
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
          checked_in_at?: string | null
          created_at?: string
          email?: string
          event_id?: string | null
          event_reservation_id?: string | null
          event_slug?: string
          evidence_url?: string | null
          first_name?: string
          id?: string
          last_name?: string
          last_request_email_sent_at?: string | null
          package_id?: string | null
          package_nombre_snapshot?: string | null
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
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_event_reservation_id_fkey"
            columns: ["event_reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_event_reservation_id_fkey"
            columns: ["event_reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
          {
            foreignKeyName: "event_participants_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reservations: {
        Row: {
          accepted_terms: boolean
          access_token: string
          admin_notes: string | null
          alumno_id: string | null
          amount_paid: number
          amount_total: number | null
          balance_due: number | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancelled_at: string | null
          checkin_at: string | null
          confirmation_payment_email_attempts: number
          confirmation_payment_email_failed_at: string | null
          confirmation_payment_email_last_error: string | null
          confirmation_payment_email_queued_at: string | null
          confirmation_payment_email_sent_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string
          currency_snapshot: string | null
          estado: string
          event_id: string
          event_participant_id: string | null
          external_email: string | null
          external_first_name: string | null
          external_last_name: string | null
          external_participant_id: string | null
          external_team_name: string | null
          genero_habitacion: string | null
          id: string
          metodo_pago: string
          moneda: string
          monto: number | null
          next_due_date: string | null
          notas: string | null
          origin: string | null
          package_id: string | null
          package_nombre_snapshot: string | null
          participant_notes: string | null
          payment_plan_id: string | null
          payment_plan_name_snapshot: string | null
          payment_plan_snapshot: Json | null
          payment_status: string
          prefiere_asignacion: boolean
          price_snapshot: number | null
          reservation_status: string
          terminos_aceptados_at: string | null
          terminos_snapshot: Json | null
          terminos_version_aceptada: string | null
          tipo_vinculo: string | null
          updated_at: string
        }
        Insert: {
          accepted_terms?: boolean
          access_token?: string
          admin_notes?: string | null
          alumno_id?: string | null
          amount_paid?: number
          amount_total?: number | null
          balance_due?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          checkin_at?: string | null
          confirmation_payment_email_attempts?: number
          confirmation_payment_email_failed_at?: string | null
          confirmation_payment_email_last_error?: string | null
          confirmation_payment_email_queued_at?: string | null
          confirmation_payment_email_sent_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          currency_snapshot?: string | null
          estado?: string
          event_id: string
          event_participant_id?: string | null
          external_email?: string | null
          external_first_name?: string | null
          external_last_name?: string | null
          external_participant_id?: string | null
          external_team_name?: string | null
          genero_habitacion?: string | null
          id?: string
          metodo_pago?: string
          moneda?: string
          monto?: number | null
          next_due_date?: string | null
          notas?: string | null
          origin?: string | null
          package_id?: string | null
          package_nombre_snapshot?: string | null
          participant_notes?: string | null
          payment_plan_id?: string | null
          payment_plan_name_snapshot?: string | null
          payment_plan_snapshot?: Json | null
          payment_status?: string
          prefiere_asignacion?: boolean
          price_snapshot?: number | null
          reservation_status?: string
          terminos_aceptados_at?: string | null
          terminos_snapshot?: Json | null
          terminos_version_aceptada?: string | null
          tipo_vinculo?: string | null
          updated_at?: string
        }
        Update: {
          accepted_terms?: boolean
          access_token?: string
          admin_notes?: string | null
          alumno_id?: string | null
          amount_paid?: number
          amount_total?: number | null
          balance_due?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          checkin_at?: string | null
          confirmation_payment_email_attempts?: number
          confirmation_payment_email_failed_at?: string | null
          confirmation_payment_email_last_error?: string | null
          confirmation_payment_email_queued_at?: string | null
          confirmation_payment_email_sent_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          currency_snapshot?: string | null
          estado?: string
          event_id?: string
          event_participant_id?: string | null
          external_email?: string | null
          external_first_name?: string | null
          external_last_name?: string | null
          external_participant_id?: string | null
          external_team_name?: string | null
          genero_habitacion?: string | null
          id?: string
          metodo_pago?: string
          moneda?: string
          monto?: number | null
          next_due_date?: string | null
          notas?: string | null
          origin?: string | null
          package_id?: string | null
          package_nombre_snapshot?: string | null
          participant_notes?: string | null
          payment_plan_id?: string | null
          payment_plan_name_snapshot?: string | null
          payment_plan_snapshot?: Json | null
          payment_status?: string
          prefiere_asignacion?: boolean
          price_snapshot?: number | null
          reservation_status?: string
          terminos_aceptados_at?: string | null
          terminos_snapshot?: Json | null
          terminos_version_aceptada?: string | null
          tipo_vinculo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reservations_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reservations_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_reservations_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "event_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reservations_event_participant_id_fkey"
            columns: ["event_participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reservations_event_participant_id_fkey"
            columns: ["event_participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants_ranking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reservations_external_participant_id_fkey"
            columns: ["external_participant_id"]
            isOneToOne: false
            referencedRelation: "event_external_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reservations_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reservations_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "event_package_payment_plans"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "event_results_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_results_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
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
      event_room_assignments: {
        Row: {
          created_at: string
          id: string
          reservation_id: string
          room_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          reservation_id: string
          room_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          reservation_id?: string
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_room_assignments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_room_assignments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
          {
            foreignKeyName: "event_room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "event_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rooms: {
        Row: {
          capacidad: number
          created_at: string
          event_id: string
          genero: string | null
          id: string
          nombre: string
          notas: string | null
          package_id: string | null
          sort_order: number
          tipo: string | null
          updated_at: string
        }
        Insert: {
          capacidad?: number
          created_at?: string
          event_id: string
          genero?: string | null
          id?: string
          nombre: string
          notas?: string | null
          package_id?: string | null
          sort_order?: number
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          capacidad?: number
          created_at?: string
          event_id?: string
          genero?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          package_id?: string | null
          sort_order?: number
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rooms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rooms_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "event_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      event_survey_responses: {
        Row: {
          alumno_id: string | null
          created_at: string
          event_id: string
          external_participant_id: string | null
          id: string
          nps: number | null
          respondent_email: string | null
          respondent_name: string | null
          respuestas: Json
          survey_id: string
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          created_at?: string
          event_id: string
          external_participant_id?: string | null
          id?: string
          nps?: number | null
          respondent_email?: string | null
          respondent_name?: string | null
          respuestas?: Json
          survey_id: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          created_at?: string
          event_id?: string
          external_participant_id?: string | null
          id?: string
          nps?: number | null
          respondent_email?: string | null
          respondent_name?: string | null
          respuestas?: Json
          survey_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_survey_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "event_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      event_survey_tokens: {
        Row: {
          alumno_id: string | null
          created_at: string
          event_id: string
          external_participant_id: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          survey_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          alumno_id?: string | null
          created_at?: string
          event_id: string
          external_participant_id?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          survey_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          alumno_id?: string | null
          created_at?: string
          event_id?: string
          external_participant_id?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          survey_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_survey_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_survey_tokens_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "event_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      event_surveys: {
        Row: {
          activa: boolean
          album_cover_image_url: string | null
          album_cta_label: string | null
          album_mensaje: string | null
          album_titulo: string | null
          album_url: string | null
          anonima: boolean
          created_at: string
          descripcion: string | null
          descuento_activo: boolean
          descuento_codigo_id: string | null
          descuento_cta_label: string | null
          descuento_evento_id: string | null
          descuento_mensaje: string | null
          descuento_porcentaje: number | null
          descuento_titulo: string | null
          descuento_url: string | null
          enviada_at: string | null
          enviada_por: string | null
          event_id: string
          fecha_envio_programada: string | null
          fecha_limite_respuesta: string | null
          id: string
          mostrar_album: boolean
          preguntas: Json
          recipients_count: number | null
          titulo: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          album_cover_image_url?: string | null
          album_cta_label?: string | null
          album_mensaje?: string | null
          album_titulo?: string | null
          album_url?: string | null
          anonima?: boolean
          created_at?: string
          descripcion?: string | null
          descuento_activo?: boolean
          descuento_codigo_id?: string | null
          descuento_cta_label?: string | null
          descuento_evento_id?: string | null
          descuento_mensaje?: string | null
          descuento_porcentaje?: number | null
          descuento_titulo?: string | null
          descuento_url?: string | null
          enviada_at?: string | null
          enviada_por?: string | null
          event_id: string
          fecha_envio_programada?: string | null
          fecha_limite_respuesta?: string | null
          id?: string
          mostrar_album?: boolean
          preguntas?: Json
          recipients_count?: number | null
          titulo?: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          album_cover_image_url?: string | null
          album_cta_label?: string | null
          album_mensaje?: string | null
          album_titulo?: string | null
          album_url?: string | null
          anonima?: boolean
          created_at?: string
          descripcion?: string | null
          descuento_activo?: boolean
          descuento_codigo_id?: string | null
          descuento_cta_label?: string | null
          descuento_evento_id?: string | null
          descuento_mensaje?: string | null
          descuento_porcentaje?: number | null
          descuento_titulo?: string | null
          descuento_url?: string | null
          enviada_at?: string | null
          enviada_por?: string | null
          event_id?: string
          fecha_envio_programada?: string | null
          fecha_limite_respuesta?: string | null
          id?: string
          mostrar_album?: boolean
          preguntas?: Json
          recipients_count?: number | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_surveys_descuento_codigo_id_fkey"
            columns: ["descuento_codigo_id"]
            isOneToOne: false
            referencedRelation: "descuentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_surveys_descuento_evento_id_fkey"
            columns: ["descuento_evento_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_surveys_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_waitlist_entries: {
        Row: {
          admin_notas: string | null
          admin_visto_at: string | null
          alumno_id: string | null
          contactado_at: string | null
          contactado_por: string | null
          created_at: string
          dni: string | null
          email: string
          estado: string
          event_id: string
          id: string
          nombre: string
          origen: string | null
          respuestas: Json
          telefono: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          admin_notas?: string | null
          admin_visto_at?: string | null
          alumno_id?: string | null
          contactado_at?: string | null
          contactado_por?: string | null
          created_at?: string
          dni?: string | null
          email: string
          estado?: string
          event_id: string
          id?: string
          nombre: string
          origen?: string | null
          respuestas?: Json
          telefono?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          admin_notas?: string | null
          admin_visto_at?: string | null
          alumno_id?: string | null
          contactado_at?: string | null
          contactado_por?: string | null
          created_at?: string
          dni?: string | null
          email?: string
          estado?: string
          event_id?: string
          id?: string
          nombre?: string
          origen?: string | null
          respuestas?: Json
          telefono?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_waitlist_entries_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_waitlist_entries_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_waitlist_entries_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "event_waitlist_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          admin_alert_emails: string[]
          bloquear_cambios_despues_de_inicio: boolean
          created_at: string
          credito_valido_solo_en_evento: boolean
          currency: string
          date: string
          description: string | null
          dias_limite_cambio_alumno: number
          duration_days: number | null
          duration_nights: number | null
          end_date: string | null
          end_time: string | null
          estado_publicacion: string
          id: string
          image_url: string | null
          incluye: string[]
          is_active: boolean
          is_own_event: boolean
          level: string | null
          location: string | null
          max_capacity: number | null
          metadata: Json
          no_incluye: string[]
          payment_mode: Database["public"]["Enums"]["event_payment_mode"]
          permite_cambio_paquete_alumno: boolean
          permitir_downgrade: boolean
          politica_precio_cambio: string
          precio_aviso_activo: boolean
          precio_aviso_hasta: string | null
          precio_aviso_texto: string | null
          precio_aviso_tipo: string
          price: number | null
          roadbook: Json | null
          same_day: boolean
          short_description: string | null
          show_public: boolean
          spots_taken: number
          start_time: string | null
          status: string
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
          visible_to_students: boolean
          waitlist_habilitada: boolean
          waitlist_mensaje: string | null
          waitlist_questions: Json
        }
        Insert: {
          admin_alert_emails?: string[]
          bloquear_cambios_despues_de_inicio?: boolean
          created_at?: string
          credito_valido_solo_en_evento?: boolean
          currency?: string
          date: string
          description?: string | null
          dias_limite_cambio_alumno?: number
          duration_days?: number | null
          duration_nights?: number | null
          end_date?: string | null
          end_time?: string | null
          estado_publicacion?: string
          id?: string
          image_url?: string | null
          incluye?: string[]
          is_active?: boolean
          is_own_event?: boolean
          level?: string | null
          location?: string | null
          max_capacity?: number | null
          metadata?: Json
          no_incluye?: string[]
          payment_mode?: Database["public"]["Enums"]["event_payment_mode"]
          permite_cambio_paquete_alumno?: boolean
          permitir_downgrade?: boolean
          politica_precio_cambio?: string
          precio_aviso_activo?: boolean
          precio_aviso_hasta?: string | null
          precio_aviso_texto?: string | null
          precio_aviso_tipo?: string
          price?: number | null
          roadbook?: Json | null
          same_day?: boolean
          short_description?: string | null
          show_public?: boolean
          spots_taken?: number
          start_time?: string | null
          status?: string
          title: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visible_to_students?: boolean
          waitlist_habilitada?: boolean
          waitlist_mensaje?: string | null
          waitlist_questions?: Json
        }
        Update: {
          admin_alert_emails?: string[]
          bloquear_cambios_despues_de_inicio?: boolean
          created_at?: string
          credito_valido_solo_en_evento?: boolean
          currency?: string
          date?: string
          description?: string | null
          dias_limite_cambio_alumno?: number
          duration_days?: number | null
          duration_nights?: number | null
          end_date?: string | null
          end_time?: string | null
          estado_publicacion?: string
          id?: string
          image_url?: string | null
          incluye?: string[]
          is_active?: boolean
          is_own_event?: boolean
          level?: string | null
          location?: string | null
          max_capacity?: number | null
          metadata?: Json
          no_incluye?: string[]
          payment_mode?: Database["public"]["Enums"]["event_payment_mode"]
          permite_cambio_paquete_alumno?: boolean
          permitir_downgrade?: boolean
          politica_precio_cambio?: string
          precio_aviso_activo?: boolean
          precio_aviso_hasta?: string | null
          precio_aviso_texto?: string | null
          precio_aviso_tipo?: string
          price?: number | null
          roadbook?: Json | null
          same_day?: boolean
          short_description?: string | null
          show_public?: boolean
          spots_taken?: number
          start_time?: string | null
          status?: string
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visible_to_students?: boolean
          waitlist_habilitada?: boolean
          waitlist_mensaje?: string | null
          waitlist_questions?: Json
        }
        Relationships: []
      }
      facturacion_cola: {
        Row: {
          alumno_id: string | null
          cliente_cuit: string | null
          cliente_nombre: string | null
          concepto: string
          created_at: string
          emisor_id: string | null
          estado: string
          factura_id: string | null
          id: string
          metodo_pago: string | null
          moneda: string
          monto: number
          motivo_arrastre: string | null
          notas: string | null
          origen_registro: string | null
          pagado_at: string
          pago_id: string
          periodo_operativo: string
          periodo_pago: string
          referencia_id: string
          referencia_tipo: string
          segmento: string | null
          source: string
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          cliente_cuit?: string | null
          cliente_nombre?: string | null
          concepto: string
          created_at?: string
          emisor_id?: string | null
          estado?: string
          factura_id?: string | null
          id?: string
          metodo_pago?: string | null
          moneda?: string
          monto: number
          motivo_arrastre?: string | null
          notas?: string | null
          origen_registro?: string | null
          pagado_at: string
          pago_id: string
          periodo_operativo: string
          periodo_pago: string
          referencia_id: string
          referencia_tipo: string
          segmento?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          cliente_cuit?: string | null
          cliente_nombre?: string | null
          concepto?: string
          created_at?: string
          emisor_id?: string | null
          estado?: string
          factura_id?: string | null
          id?: string
          metodo_pago?: string | null
          moneda?: string
          monto?: number
          motivo_arrastre?: string | null
          notas?: string | null
          origen_registro?: string | null
          pagado_at?: string
          pago_id?: string
          periodo_operativo?: string
          periodo_pago?: string
          referencia_id?: string
          referencia_tipo?: string
          segmento?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_cola_emisor_id_fkey"
            columns: ["emisor_id"]
            isOneToOne: false
            referencedRelation: "emisor_facturado_anual"
            referencedColumns: ["emisor_id"]
          },
          {
            foreignKeyName: "facturacion_cola_emisor_id_fkey"
            columns: ["emisor_id"]
            isOneToOne: false
            referencedRelation: "emisores_fiscales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_cola_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          alumno_id: string | null
          cae: string | null
          cae_vencimiento: string | null
          cliente_cuit: string | null
          cliente_nombre: string
          concepto: string
          condicion_fiscal: string
          created_at: string
          cuenta_mp_id: string | null
          email_enviado_at: string | null
          emisor_id: string | null
          error_detalle: string | null
          estado: string
          facturacion_cola_id: string | null
          fecha_emision: string | null
          id: string
          letra_comprobante: string | null
          metodo_pago: string | null
          moneda: string
          monto: number
          numero_comprobante: string | null
          origen_registro: string | null
          pdf_generated_at: string | null
          pdf_path: string | null
          referencia_id: string | null
          referencia_tipo: string
          segmento: string | null
          tipo_comprobante: number | null
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          cae?: string | null
          cae_vencimiento?: string | null
          cliente_cuit?: string | null
          cliente_nombre: string
          concepto: string
          condicion_fiscal?: string
          created_at?: string
          cuenta_mp_id?: string | null
          email_enviado_at?: string | null
          emisor_id?: string | null
          error_detalle?: string | null
          estado?: string
          facturacion_cola_id?: string | null
          fecha_emision?: string | null
          id?: string
          letra_comprobante?: string | null
          metodo_pago?: string | null
          moneda?: string
          monto: number
          numero_comprobante?: string | null
          origen_registro?: string | null
          pdf_generated_at?: string | null
          pdf_path?: string | null
          referencia_id?: string | null
          referencia_tipo?: string
          segmento?: string | null
          tipo_comprobante?: number | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          cae?: string | null
          cae_vencimiento?: string | null
          cliente_cuit?: string | null
          cliente_nombre?: string
          concepto?: string
          condicion_fiscal?: string
          created_at?: string
          cuenta_mp_id?: string | null
          email_enviado_at?: string | null
          emisor_id?: string | null
          error_detalle?: string | null
          estado?: string
          facturacion_cola_id?: string | null
          fecha_emision?: string | null
          id?: string
          letra_comprobante?: string | null
          metodo_pago?: string | null
          moneda?: string
          monto?: number
          numero_comprobante?: string | null
          origen_registro?: string | null
          pdf_generated_at?: string | null
          pdf_path?: string | null
          referencia_id?: string | null
          referencia_tipo?: string
          segmento?: string | null
          tipo_comprobante?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "facturas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "facturas_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_emisor_id_fkey"
            columns: ["emisor_id"]
            isOneToOne: false
            referencedRelation: "emisor_facturado_anual"
            referencedColumns: ["emisor_id"]
          },
          {
            foreignKeyName: "facturas_emisor_id_fkey"
            columns: ["emisor_id"]
            isOneToOne: false
            referencedRelation: "emisores_fiscales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_facturacion_cola_id_fkey"
            columns: ["facturacion_cola_id"]
            isOneToOne: false
            referencedRelation: "facturacion_cola"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_coach: {
        Row: {
          alumno_id: string
          coach_id: string
          coach_id_secundario: string | null
          comentario: string
          created_at: string
          entrenamiento_id: string | null
          fecha: string
          id: string
          origen: string | null
          origen_nota_id: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          alumno_id: string
          coach_id: string
          coach_id_secundario?: string | null
          comentario: string
          created_at?: string
          entrenamiento_id?: string | null
          fecha?: string
          id?: string
          origen?: string | null
          origen_nota_id?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          coach_id?: string
          coach_id_secundario?: string | null
          comentario?: string
          created_at?: string
          entrenamiento_id?: string | null
          fecha?: string
          id?: string
          origen?: string | null
          origen_nota_id?: string | null
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
            foreignKeyName: "feedback_coach_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "feedback_coach_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "feedback_coach_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_coach_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_coach_coach_id_secundario_fkey"
            columns: ["coach_id_secundario"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_coach_coach_id_secundario_fkey"
            columns: ["coach_id_secundario"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_coach_entrenamiento_id_fkey"
            columns: ["entrenamiento_id"]
            isOneToOne: false
            referencedRelation: "entrenamientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_coach_origen_nota_id_fkey"
            columns: ["origen_nota_id"]
            isOneToOne: false
            referencedRelation: "alumno_evaluaciones_coach_notas"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          created_at: string
          descripcion: string
          estado_conciliacion: string
          event_id: string | null
          fecha: string
          forma_pago: string
          frecuencia: string | null
          id: string
          liquidacion_id: string | null
          moneda: string
          monto: number
          mp_external_reference: string | null
          mp_payment_id: string | null
          mp_status: string | null
          notas: string | null
          origen_registro: string
          proveedor: string | null
          recurrente: boolean
          registrado_por: string | null
          subcategoria: string | null
          unidad_negocio: string
          updated_at: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          descripcion: string
          estado_conciliacion?: string
          event_id?: string | null
          fecha?: string
          forma_pago?: string
          frecuencia?: string | null
          id?: string
          liquidacion_id?: string | null
          moneda?: string
          monto: number
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_status?: string | null
          notas?: string | null
          origen_registro?: string
          proveedor?: string | null
          recurrente?: boolean
          registrado_por?: string | null
          subcategoria?: string | null
          unidad_negocio?: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          descripcion?: string
          estado_conciliacion?: string
          event_id?: string | null
          fecha?: string
          forma_pago?: string
          frecuencia?: string | null
          id?: string
          liquidacion_id?: string | null
          moneda?: string
          monto?: number
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_status?: string | null
          notas?: string | null
          origen_registro?: string
          proveedor?: string | null
          recurrente?: boolean
          registrado_por?: string | null
          subcategoria?: string | null
          unidad_negocio?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones_mensuales"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_deuda_movimientos: {
        Row: {
          concepto: string | null
          creado_por: string | null
          created_at: string
          ejecucion_id: string | null
          fecha: string
          forma_pago: string | null
          gasto_id: string | null
          id: string
          moneda: string
          monto: number
          notas: string | null
          recurrente_id: string
          tipo: Database["public"]["Enums"]["gasto_deuda_tipo"]
          updated_at: string
        }
        Insert: {
          concepto?: string | null
          creado_por?: string | null
          created_at?: string
          ejecucion_id?: string | null
          fecha?: string
          forma_pago?: string | null
          gasto_id?: string | null
          id?: string
          moneda?: string
          monto: number
          notas?: string | null
          recurrente_id: string
          tipo: Database["public"]["Enums"]["gasto_deuda_tipo"]
          updated_at?: string
        }
        Update: {
          concepto?: string | null
          creado_por?: string | null
          created_at?: string
          ejecucion_id?: string | null
          fecha?: string
          forma_pago?: string | null
          gasto_id?: string | null
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
          recurrente_id?: string
          tipo?: Database["public"]["Enums"]["gasto_deuda_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_deuda_movimientos_ejecucion_id_fkey"
            columns: ["ejecucion_id"]
            isOneToOne: false
            referencedRelation: "gastos_ejecuciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_deuda_movimientos_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_deuda_movimientos_recurrente_id_fkey"
            columns: ["recurrente_id"]
            isOneToOne: false
            referencedRelation: "gastos_recurrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_ejecucion_pagos: {
        Row: {
          created_at: string
          ejecucion_id: string
          es_excedente: boolean
          fecha: string
          forma_pago: string
          gasto_id: string | null
          id: string
          monto: number
          motivo_excedente: string | null
          notas: string | null
          pagado_por: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ejecucion_id: string
          es_excedente?: boolean
          fecha: string
          forma_pago: string
          gasto_id?: string | null
          id?: string
          monto: number
          motivo_excedente?: string | null
          notas?: string | null
          pagado_por?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ejecucion_id?: string
          es_excedente?: boolean
          fecha?: string
          forma_pago?: string
          gasto_id?: string | null
          id?: string
          monto?: number
          motivo_excedente?: string | null
          notas?: string | null
          pagado_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_ejecucion_pagos_ejecucion_id_fkey"
            columns: ["ejecucion_id"]
            isOneToOne: false
            referencedRelation: "gastos_ejecuciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_ejecucion_pagos_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_ejecuciones: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["gasto_ejecucion_estado"]
          event_id: string | null
          fecha_pago: string | null
          fecha_vencimiento: string | null
          forma_pago: string | null
          gasto_id: string | null
          id: string
          mes: string
          moneda: string
          monto_pagado: number | null
          monto_previsto: number
          notas: string | null
          pagado_por: string | null
          recurrente_id: string | null
          unidad_negocio: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["gasto_ejecucion_estado"]
          event_id?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          forma_pago?: string | null
          gasto_id?: string | null
          id?: string
          mes: string
          moneda?: string
          monto_pagado?: number | null
          monto_previsto?: number
          notas?: string | null
          pagado_por?: string | null
          recurrente_id?: string | null
          unidad_negocio?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["gasto_ejecucion_estado"]
          event_id?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          forma_pago?: string | null
          gasto_id?: string | null
          id?: string
          mes?: string
          moneda?: string
          monto_pagado?: number | null
          monto_previsto?: number
          notas?: string | null
          pagado_por?: string | null
          recurrente_id?: string | null
          unidad_negocio?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_ejecuciones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_ejecuciones_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_ejecuciones_recurrente_id_fkey"
            columns: ["recurrente_id"]
            isOneToOne: false
            referencedRelation: "gastos_recurrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_mp_webhook_log: {
        Row: {
          created_at: string
          decision: string | null
          error: string | null
          gasto_id: string | null
          http_status: number | null
          id: string
          mp_event_type: string | null
          mp_payment_id: string | null
          mp_payment_raw: Json | null
          raw_body: Json | null
          raw_headers: Json | null
          signature_valid: boolean | null
        }
        Insert: {
          created_at?: string
          decision?: string | null
          error?: string | null
          gasto_id?: string | null
          http_status?: number | null
          id?: string
          mp_event_type?: string | null
          mp_payment_id?: string | null
          mp_payment_raw?: Json | null
          raw_body?: Json | null
          raw_headers?: Json | null
          signature_valid?: boolean | null
        }
        Update: {
          created_at?: string
          decision?: string | null
          error?: string | null
          gasto_id?: string | null
          http_status?: number | null
          id?: string
          mp_event_type?: string | null
          mp_payment_id?: string | null
          mp_payment_raw?: Json | null
          raw_body?: Json | null
          raw_headers?: Json | null
          signature_valid?: boolean | null
        }
        Relationships: []
      }
      gastos_recurrentes: {
        Row: {
          activo: boolean
          ambito: Database["public"]["Enums"]["gasto_ambito"]
          archivado_at: string | null
          archivado_por: string | null
          categoria: string
          concepto: string
          created_at: string
          dia_vencimiento: number | null
          event_id: string | null
          forma_pago_default: string | null
          frecuencia: Database["public"]["Enums"]["gasto_frecuencia"]
          id: string
          meses_aplicables: number[] | null
          modalidad_pago: string
          moneda: string
          monto_estimado: number
          notas: string | null
          proveedor: string | null
          responsable: string | null
          tipo: string
          unidad_negocio: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          ambito?: Database["public"]["Enums"]["gasto_ambito"]
          archivado_at?: string | null
          archivado_por?: string | null
          categoria: string
          concepto: string
          created_at?: string
          dia_vencimiento?: number | null
          event_id?: string | null
          forma_pago_default?: string | null
          frecuencia?: Database["public"]["Enums"]["gasto_frecuencia"]
          id?: string
          meses_aplicables?: number[] | null
          modalidad_pago?: string
          moneda?: string
          monto_estimado?: number
          notas?: string | null
          proveedor?: string | null
          responsable?: string | null
          tipo?: string
          unidad_negocio?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          ambito?: Database["public"]["Enums"]["gasto_ambito"]
          archivado_at?: string | null
          archivado_por?: string | null
          categoria?: string
          concepto?: string
          created_at?: string
          dia_vencimiento?: number | null
          event_id?: string | null
          forma_pago_default?: string | null
          frecuencia?: Database["public"]["Enums"]["gasto_frecuencia"]
          id?: string
          meses_aplicables?: number[] | null
          modalidad_pago?: string
          moneda?: string
          monto_estimado?: number
          notas?: string | null
          proveedor?: string | null
          responsable?: string | null
          tipo?: string
          unidad_negocio?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_recurrentes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_familiar: {
        Row: {
          created_at: string
          id: string
          nombre: string
          notas: string | null
          titular_alumno_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          notas?: string | null
          titular_alumno_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          notas?: string | null
          titular_alumno_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_familiar_titular_alumno_id_fkey"
            columns: ["titular_alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_familiar_titular_alumno_id_fkey"
            columns: ["titular_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "grupo_familiar_titular_alumno_id_fkey"
            columns: ["titular_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      grupo_familiar_miembros: {
        Row: {
          alumno_id: string
          created_at: string
          grupo_id: string
          id: string
          recibe_descuento: boolean
        }
        Insert: {
          alumno_id: string
          created_at?: string
          grupo_id: string
          id?: string
          recibe_descuento?: boolean
        }
        Update: {
          alumno_id?: string
          created_at?: string
          grupo_id?: string
          id?: string
          recibe_descuento?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "grupo_familiar_miembros_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_familiar_miembros_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "grupo_familiar_miembros_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "grupo_familiar_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupo_familiar"
            referencedColumns: ["id"]
          },
        ]
      }
      honorarios: {
        Row: {
          activo: boolean
          categoria: string
          coach_id: string | null
          created_at: string
          id: string
          nombre_concepto: string
          updated_at: string
          valor: number
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        Insert: {
          activo?: boolean
          categoria?: string
          coach_id?: string | null
          created_at?: string
          id?: string
          nombre_concepto: string
          updated_at?: string
          valor?: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Update: {
          activo?: boolean
          categoria?: string
          coach_id?: string | null
          created_at?: string
          id?: string
          nombre_concepto?: string
          updated_at?: string
          valor?: number
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "honorarios_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honorarios_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
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
      liquidaciones_mensuales: {
        Row: {
          coach_id: string
          created_at: string
          estado: string
          fecha_envio: string | null
          fecha_pago: string | null
          id: string
          mes: string
          observaciones_admin: string | null
          total_confirmado: number
          total_estimado: number
          total_pagado: number
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          estado?: string
          fecha_envio?: string | null
          fecha_pago?: string | null
          id?: string
          mes: string
          observaciones_admin?: string | null
          total_confirmado?: number
          total_estimado?: number
          total_pagado?: number
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          estado?: string
          fecha_envio?: string | null
          fecha_pago?: string | null
          id?: string
          mes?: string
          observaciones_admin?: string | null
          total_confirmado?: number
          total_estimado?: number
          total_pagado?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_mensuales_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_mensuales_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contacts: {
        Row: {
          agenda_estado: string | null
          alumno_id: string | null
          apellido: string | null
          capturado_por_email: string | null
          capturado_por_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          es_email_secundario: boolean
          google_etag: string | null
          google_resource_name: string | null
          google_sync_error: string | null
          google_sync_pending: boolean
          google_synced_at: string | null
          id: string
          last_campaign_sent_at: string | null
          nombre: string | null
          notas: string | null
          opt_in_marketing: boolean
          opt_out_at: string | null
          opt_out_reason: string | null
          origen: string | null
          source_alumno_id: string | null
          source_event_participant_id: string | null
          tags: string[]
          telefono: string | null
          telefono_normalizado: string | null
          tipo: Database["public"]["Enums"]["marketing_contact_type"]
          updated_at: string
        }
        Insert: {
          agenda_estado?: string | null
          alumno_id?: string | null
          apellido?: string | null
          capturado_por_email?: string | null
          capturado_por_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          es_email_secundario?: boolean
          google_etag?: string | null
          google_resource_name?: string | null
          google_sync_error?: string | null
          google_sync_pending?: boolean
          google_synced_at?: string | null
          id?: string
          last_campaign_sent_at?: string | null
          nombre?: string | null
          notas?: string | null
          opt_in_marketing?: boolean
          opt_out_at?: string | null
          opt_out_reason?: string | null
          origen?: string | null
          source_alumno_id?: string | null
          source_event_participant_id?: string | null
          tags?: string[]
          telefono?: string | null
          telefono_normalizado?: string | null
          tipo?: Database["public"]["Enums"]["marketing_contact_type"]
          updated_at?: string
        }
        Update: {
          agenda_estado?: string | null
          alumno_id?: string | null
          apellido?: string | null
          capturado_por_email?: string | null
          capturado_por_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          es_email_secundario?: boolean
          google_etag?: string | null
          google_resource_name?: string | null
          google_sync_error?: string | null
          google_sync_pending?: boolean
          google_synced_at?: string | null
          id?: string
          last_campaign_sent_at?: string | null
          nombre?: string | null
          notas?: string | null
          opt_in_marketing?: boolean
          opt_out_at?: string | null
          opt_out_reason?: string | null
          origen?: string | null
          source_alumno_id?: string | null
          source_event_participant_id?: string | null
          tags?: string[]
          telefono?: string | null
          telefono_normalizado?: string | null
          tipo?: Database["public"]["Enums"]["marketing_contact_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contacts_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contacts_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "marketing_contacts_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "marketing_contacts_source_alumno_id_fkey"
            columns: ["source_alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contacts_source_alumno_id_fkey"
            columns: ["source_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "marketing_contacts_source_alumno_id_fkey"
            columns: ["source_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "marketing_contacts_source_event_participant_id_fkey"
            columns: ["source_event_participant_id"]
            isOneToOne: false
            referencedRelation: "event_external_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      mejoras_sugeridas: {
        Row: {
          autor_email: string
          autor_nombre: string
          created_at: string
          id: string
          leido: boolean
          mensaje: string
        }
        Insert: {
          autor_email: string
          autor_nombre: string
          created_at?: string
          id?: string
          leido?: boolean
          mensaje: string
        }
        Update: {
          autor_email?: string
          autor_nombre?: string
          created_at?: string
          id?: string
          leido?: boolean
          mensaje?: string
        }
        Relationships: []
      }
      movimientos_liquidacion: {
        Row: {
          alumno_id: string | null
          coach_id: string
          created_at: string
          duracion: number | null
          entrada: number
          entrenamiento_id: string | null
          estado_economico: string
          estado_operativo: string
          evento: string | null
          extras: number
          fecha: string
          grupo: string | null
          id: string
          liquidacion_mensual_id: string | null
          nombre_externo: string | null
          observaciones: string | null
          origen: string
          reserva_turnera_id: string | null
          sede_id: string | null
          tipo_actividad: string
          total: number
          updated_at: string
          valor_base: number
          viaticos: number
        }
        Insert: {
          alumno_id?: string | null
          coach_id: string
          created_at?: string
          duracion?: number | null
          entrada?: number
          entrenamiento_id?: string | null
          estado_economico?: string
          estado_operativo?: string
          evento?: string | null
          extras?: number
          fecha: string
          grupo?: string | null
          id?: string
          liquidacion_mensual_id?: string | null
          nombre_externo?: string | null
          observaciones?: string | null
          origen?: string
          reserva_turnera_id?: string | null
          sede_id?: string | null
          tipo_actividad: string
          total?: number
          updated_at?: string
          valor_base?: number
          viaticos?: number
        }
        Update: {
          alumno_id?: string | null
          coach_id?: string
          created_at?: string
          duracion?: number | null
          entrada?: number
          entrenamiento_id?: string | null
          estado_economico?: string
          estado_operativo?: string
          evento?: string | null
          extras?: number
          fecha?: string
          grupo?: string | null
          id?: string
          liquidacion_mensual_id?: string | null
          nombre_externo?: string | null
          observaciones?: string | null
          origen?: string
          reserva_turnera_id?: string | null
          sede_id?: string | null
          tipo_actividad?: string
          total?: number
          updated_at?: string
          valor_base?: number
          viaticos?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_liquidacion_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_entrenamiento_id_fkey"
            columns: ["entrenamiento_id"]
            isOneToOne: false
            referencedRelation: "entrenamientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_liquidacion_mensual_id_fkey"
            columns: ["liquidacion_mensual_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones_mensuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_reserva_turnera_id_fkey"
            columns: ["reserva_turnera_id"]
            isOneToOne: false
            referencedRelation: "reservas_turnera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_reserva_turnera_id_fkey"
            columns: ["reserva_turnera_id"]
            isOneToOne: false
            referencedRelation: "vw_turnera_sede_backfill"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_account_movements: {
        Row: {
          alumno_id: string | null
          amount: number
          assign_notes: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_manually: boolean
          categorizado_at: string | null
          categorizado_por: string | null
          created_at: string
          cuenta_mp_id: string
          currency: string
          description: string | null
          direccion: string
          external_reference: string | null
          fecha_movimiento: string
          fee_amount: number | null
          gasto_id: string | null
          id: string
          mp_payment_id: string
          net_received: number | null
          payer_document: string | null
          payer_email: string | null
          payer_name: string | null
          payment_method: string | null
          payment_type: string | null
          raw: Json | null
          reservation_payment_id: string | null
          status: string | null
          status_detail: string | null
          suscripcion_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          amount: number
          assign_notes?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_manually?: boolean
          categorizado_at?: string | null
          categorizado_por?: string | null
          created_at?: string
          cuenta_mp_id: string
          currency?: string
          description?: string | null
          direccion?: string
          external_reference?: string | null
          fecha_movimiento: string
          fee_amount?: number | null
          gasto_id?: string | null
          id?: string
          mp_payment_id: string
          net_received?: number | null
          payer_document?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payment_method?: string | null
          payment_type?: string | null
          raw?: Json | null
          reservation_payment_id?: string | null
          status?: string | null
          status_detail?: string | null
          suscripcion_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          amount?: number
          assign_notes?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_manually?: boolean
          categorizado_at?: string | null
          categorizado_por?: string | null
          created_at?: string
          cuenta_mp_id?: string
          currency?: string
          description?: string | null
          direccion?: string
          external_reference?: string | null
          fecha_movimiento?: string
          fee_amount?: number | null
          gasto_id?: string | null
          id?: string
          mp_payment_id?: string
          net_received?: number | null
          payer_document?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payment_method?: string | null
          payment_type?: string | null
          raw?: Json | null
          reservation_payment_id?: string | null
          status?: string | null
          status_detail?: string | null
          suscripcion_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_account_movements_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mp_account_movements_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "mp_account_movements_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "mp_account_movements_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mp_account_movements_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mp_account_movements_reservation_payment_id_fkey"
            columns: ["reservation_payment_id"]
            isOneToOne: false
            referencedRelation: "reservation_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mp_account_movements_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mp_account_movements_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["obligacion_id"]
          },
          {
            foreignKeyName: "mp_account_movements_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_inconsistencias_early_renewal"
            referencedColumns: ["pago_id"]
          },
          {
            foreignKeyName: "mp_account_movements_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_1_id"]
          },
          {
            foreignKeyName: "mp_account_movements_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "vw_programa_posibles_duplicados"
            referencedColumns: ["suscripcion_2_id"]
          },
        ]
      }
      objetivos_alumno: {
        Row: {
          activo: boolean
          alumno_id: string
          created_at: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          alumno_id: string
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          alumno_id?: string
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objetivos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objetivos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "objetivos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      pagos_imputaciones: {
        Row: {
          alumno_id: string
          anulado_at: string | null
          anulado_por: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          moneda: string
          monto: number
          motivo_anulacion: string | null
          obligacion_id: string
          obligacion_tipo: string
          pago_origen_id: string
          pago_origen_tipo: string
        }
        Insert: {
          alumno_id: string
          anulado_at?: string | null
          anulado_por?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          moneda?: string
          monto: number
          motivo_anulacion?: string | null
          obligacion_id: string
          obligacion_tipo: string
          pago_origen_id: string
          pago_origen_tipo: string
        }
        Update: {
          alumno_id?: string
          anulado_at?: string | null
          anulado_por?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          moneda?: string
          monto?: number
          motivo_anulacion?: string | null
          obligacion_id?: string
          obligacion_tipo?: string
          pago_origen_id?: string
          pago_origen_tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_imputaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_imputaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "pagos_imputaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      pedidos_externos: {
        Row: {
          cantidad: number
          cliente_email: string | null
          cliente_nombre: string
          cliente_telefono: string | null
          created_at: string
          created_by: string | null
          estado: string
          externo_ref: string | null
          foto_path: string | null
          foto_url: string | null
          id: string
          notas: string | null
          ocr_raw: Json | null
          origen: string
          producto: string | null
          sede_id: string | null
          ubicacion: string | null
          updated_at: string
          variante: string | null
        }
        Insert: {
          cantidad?: number
          cliente_email?: string | null
          cliente_nombre: string
          cliente_telefono?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          externo_ref?: string | null
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          notas?: string | null
          ocr_raw?: Json | null
          origen?: string
          producto?: string | null
          sede_id?: string | null
          ubicacion?: string | null
          updated_at?: string
          variante?: string | null
        }
        Update: {
          cantidad?: number
          cliente_email?: string | null
          cliente_nombre?: string
          cliente_telefono?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          externo_ref?: string | null
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          notas?: string | null
          ocr_raw?: Json | null
          origen?: string
          producto?: string | null
          sede_id?: string | null
          ubicacion?: string | null
          updated_at?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_externos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
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
      plan_price_stages: {
        Row: {
          activo: boolean
          created_at: string
          cuotas_cantidad: number | null
          fecha_desde: string
          fecha_hasta: string
          id: string
          nombre: string
          orden: number
          plan_id: string
          precio: number
          precio_cuota: number | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuotas_cantidad?: number | null
          fecha_desde: string
          fecha_hasta: string
          id?: string
          nombre: string
          orden?: number
          plan_id: string
          precio: number
          precio_cuota?: number | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuotas_cantidad?: number | null
          fecha_desde?: string
          fecha_hasta?: string
          id?: string
          nombre?: string
          orden?: number
          plan_id?: string
          precio?: number
          precio_cuota?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_price_stages_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_price_stages_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          acceso_beneficios: boolean
          acceso_entrenamientos: boolean
          acceso_eventos: boolean
          acceso_whatsapp: boolean
          activo: boolean
          categoria: string
          clases_incluidas: number | null
          clases_por_semana: number | null
          cohort_slug: string | null
          created_at: string
          cuota_valor: number | null
          cuotas_cantidad: number | null
          descripcion: string | null
          descripcion_corta: string | null
          es_programa_cerrado: boolean
          features: Json
          fecha_cierre_inscripcion: string | null
          fecha_fin_programa: string | null
          fecha_inicio_programa: string | null
          frecuencia: string
          id: string
          imagen_url: string | null
          inscripciones_actuales: number
          landing_public: boolean
          max_inscripciones: number | null
          moneda: string
          nombre: string
          permite_auto_cobro: boolean
          precio: number
          precio_promocional: number | null
          renovacion_auto_permitida: boolean
          tipo: string
          tipo_consumo: string
          updated_at: string
          vigencia_dias: number | null
          visibilidad: string
          whatsapp_url: string | null
        }
        Insert: {
          acceso_beneficios?: boolean
          acceso_entrenamientos?: boolean
          acceso_eventos?: boolean
          acceso_whatsapp?: boolean
          activo?: boolean
          categoria?: string
          clases_incluidas?: number | null
          clases_por_semana?: number | null
          cohort_slug?: string | null
          created_at?: string
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          es_programa_cerrado?: boolean
          features?: Json
          fecha_cierre_inscripcion?: string | null
          fecha_fin_programa?: string | null
          fecha_inicio_programa?: string | null
          frecuencia: string
          id?: string
          imagen_url?: string | null
          inscripciones_actuales?: number
          landing_public?: boolean
          max_inscripciones?: number | null
          moneda?: string
          nombre: string
          permite_auto_cobro?: boolean
          precio: number
          precio_promocional?: number | null
          renovacion_auto_permitida?: boolean
          tipo?: string
          tipo_consumo?: string
          updated_at?: string
          vigencia_dias?: number | null
          visibilidad?: string
          whatsapp_url?: string | null
        }
        Update: {
          acceso_beneficios?: boolean
          acceso_entrenamientos?: boolean
          acceso_eventos?: boolean
          acceso_whatsapp?: boolean
          activo?: boolean
          categoria?: string
          clases_incluidas?: number | null
          clases_por_semana?: number | null
          cohort_slug?: string | null
          created_at?: string
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          es_programa_cerrado?: boolean
          features?: Json
          fecha_cierre_inscripcion?: string | null
          fecha_fin_programa?: string | null
          fecha_inicio_programa?: string | null
          frecuencia?: string
          id?: string
          imagen_url?: string | null
          inscripciones_actuales?: number
          landing_public?: boolean
          max_inscripciones?: number | null
          moneda?: string
          nombre?: string
          permite_auto_cobro?: boolean
          precio?: number
          precio_promocional?: number | null
          renovacion_auto_permitida?: boolean
          tipo?: string
          tipo_consumo?: string
          updated_at?: string
          vigencia_dias?: number | null
          visibilidad?: string
          whatsapp_url?: string | null
        }
        Relationships: []
      }
      planes_sedes: {
        Row: {
          id: string
          plan_id: string
          sede_id: string
        }
        Insert: {
          id?: string
          plan_id: string
          sede_id: string
        }
        Update: {
          id?: string
          plan_id?: string
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planes_sedes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planes_sedes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planes_sedes_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
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
      precio_historial: {
        Row: {
          aplicado_at: string | null
          aplicar_a: string
          created_at: string
          fecha_cambio: string
          fecha_vigencia: string | null
          id: string
          modificado_por: string | null
          notas: string | null
          plan_id: string
          precio_anterior: number
          precio_nuevo: number
          suscripciones_actualizadas: number
        }
        Insert: {
          aplicado_at?: string | null
          aplicar_a?: string
          created_at?: string
          fecha_cambio?: string
          fecha_vigencia?: string | null
          id?: string
          modificado_por?: string | null
          notas?: string | null
          plan_id: string
          precio_anterior: number
          precio_nuevo: number
          suscripciones_actualizadas?: number
        }
        Update: {
          aplicado_at?: string | null
          aplicar_a?: string
          created_at?: string
          fecha_cambio?: string
          fecha_vigencia?: string | null
          id?: string
          modificado_por?: string | null
          notas?: string | null
          plan_id?: string
          precio_anterior?: number
          precio_nuevo?: number
          suscripciones_actualizadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "precio_historial_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precio_historial_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
        ]
      }
      process_instance_stages: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          entidad_ref_id: string | null
          entidad_ref_texto: string | null
          estado: Database["public"]["Enums"]["process_stage_estado"]
          foto_url: string | null
          id: string
          instance_id: string
          nota: string | null
          orden: number
          subtasks_state: Json
          template_stage_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          entidad_ref_id?: string | null
          entidad_ref_texto?: string | null
          estado?: Database["public"]["Enums"]["process_stage_estado"]
          foto_url?: string | null
          id?: string
          instance_id: string
          nota?: string | null
          orden: number
          subtasks_state?: Json
          template_stage_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          entidad_ref_id?: string | null
          entidad_ref_texto?: string | null
          estado?: Database["public"]["Enums"]["process_stage_estado"]
          foto_url?: string | null
          id?: string
          instance_id?: string
          nota?: string | null
          orden?: number
          subtasks_state?: Json
          template_stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_instance_stages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "process_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instance_stages_template_stage_id_fkey"
            columns: ["template_stage_id"]
            isOneToOne: false
            referencedRelation: "process_template_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      process_instances: {
        Row: {
          asignado_a: string | null
          completed_at: string | null
          created_at: string
          destinatario_reporte_email: string | null
          estado: Database["public"]["Enums"]["process_instance_estado"]
          id: string
          iniciado_por: string
          metadata: Json
          plan_id: string | null
          started_at: string
          template_id: string
          updated_at: string
        }
        Insert: {
          asignado_a?: string | null
          completed_at?: string | null
          created_at?: string
          destinatario_reporte_email?: string | null
          estado?: Database["public"]["Enums"]["process_instance_estado"]
          id?: string
          iniciado_por: string
          metadata?: Json
          plan_id?: string | null
          started_at?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          asignado_a?: string | null
          completed_at?: string | null
          created_at?: string
          destinatario_reporte_email?: string | null
          estado?: Database["public"]["Enums"]["process_instance_estado"]
          id?: string
          iniciado_por?: string
          metadata?: Json
          plan_id?: string | null
          started_at?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_instances_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instances_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_template_stages: {
        Row: {
          accion_final: Database["public"]["Enums"]["process_accion_final"]
          created_at: string
          entidad_control: Database["public"]["Enums"]["process_entidad_control"]
          id: string
          instrucciones: string | null
          orden: number
          requiere_foto: boolean
          requiere_nota: boolean
          subtasks: Json
          template_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          accion_final?: Database["public"]["Enums"]["process_accion_final"]
          created_at?: string
          entidad_control?: Database["public"]["Enums"]["process_entidad_control"]
          id?: string
          instrucciones?: string | null
          orden: number
          requiere_foto?: boolean
          requiere_nota?: boolean
          subtasks?: Json
          template_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          accion_final?: Database["public"]["Enums"]["process_accion_final"]
          created_at?: string
          entidad_control?: Database["public"]["Enums"]["process_entidad_control"]
          id?: string
          instrucciones?: string | null
          orden?: number
          requiere_foto?: boolean
          requiere_nota?: boolean
          subtasks?: Json
          template_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_template_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_templates: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          descripcion: string | null
          icono: string | null
          id: string
          nombre: string
          plan_id: string | null
          rol_destino: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          nombre: string
          plan_id?: string | null
          rol_destino?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          nombre?: string
          plan_id?: string | null
          rol_destino?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_templates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_templates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          codigo: string
          created_at: string
          created_by: string | null
          id: string
          origen: string
          proveedor: string | null
          store_product_id: string
          updated_at: string
          variante: Json | null
        }
        Insert: {
          codigo: string
          created_at?: string
          created_by?: string | null
          id?: string
          origen?: string
          proveedor?: string | null
          store_product_id: string
          updated_at?: string
          variante?: Json | null
        }
        Update: {
          codigo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          origen?: string
          proveedor?: string | null
          store_product_id?: string
          updated_at?: string
          variante?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_store_product_id_fkey"
            columns: ["store_product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_backfill_test_results: {
        Row: {
          detalle: string | null
          estado: string
          id: number
          nombre: string | null
          run_at: string
          test: number
        }
        Insert: {
          detalle?: string | null
          estado: string
          id?: number
          nombre?: string | null
          run_at?: string
          test: number
        }
        Update: {
          detalle?: string | null
          estado?: string
          id?: number
          nombre?: string | null
          run_at?: string
          test?: number
        }
        Relationships: []
      }
      qa_stock_test_results: {
        Row: {
          detalle: string | null
          estado: string
          id: number
          nombre: string | null
          run_at: string
          test: number
        }
        Insert: {
          detalle?: string | null
          estado: string
          id?: number
          nombre?: string | null
          run_at?: string
          test: number
        }
        Update: {
          detalle?: string | null
          estado?: string
          id?: number
          nombre?: string | null
          run_at?: string
          test?: number
        }
        Relationships: []
      }
      redes_sociales_tareas: {
        Row: {
          clase_dictada_id: string | null
          coach_id: string | null
          created_at: string
          estado: string
          fecha_clase: string | null
          foto_url: string | null
          id: string
          link_publicacion: string | null
          notas: string | null
          publicado_at: string | null
          publicado_por: string | null
          red_social: string | null
          sede_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          clase_dictada_id?: string | null
          coach_id?: string | null
          created_at?: string
          estado?: string
          fecha_clase?: string | null
          foto_url?: string | null
          id?: string
          link_publicacion?: string | null
          notas?: string | null
          publicado_at?: string | null
          publicado_por?: string | null
          red_social?: string | null
          sede_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          clase_dictada_id?: string | null
          coach_id?: string | null
          created_at?: string
          estado?: string
          fecha_clase?: string | null
          foto_url?: string | null
          id?: string
          link_publicacion?: string | null
          notas?: string | null
          publicado_at?: string | null
          publicado_por?: string | null
          red_social?: string | null
          sede_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "redes_sociales_tareas_clase_dictada_id_fkey"
            columns: ["clase_dictada_id"]
            isOneToOne: false
            referencedRelation: "clases_dictadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redes_sociales_tareas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redes_sociales_tareas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redes_sociales_tareas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_sesiones: {
        Row: {
          alumno_id: string
          created_at: string
          entrenamiento_id: string
          estado: string
          fecha_registro: string
          id: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          entrenamiento_id: string
          estado?: string
          fecha_registro?: string
          id?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          entrenamiento_id?: string
          estado?: string
          fecha_registro?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_sesiones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_sesiones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "registro_sesiones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "registro_sesiones_entrenamiento_id_fkey"
            columns: ["entrenamiento_id"]
            isOneToOne: false
            referencedRelation: "entrenamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      reglas_liquidacion: {
        Row: {
          created_at: string
          estado_operativo: string
          id: string
          liquida: boolean
          observacion: string | null
          porcentaje_pago: number
          tipo_actividad: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado_operativo: string
          id?: string
          liquida?: boolean
          observacion?: string | null
          porcentaje_pago?: number
          tipo_actividad: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado_operativo?: string
          id?: string
          liquida?: boolean
          observacion?: string | null
          porcentaje_pago?: number
          tipo_actividad?: string
          updated_at?: string
        }
        Relationships: []
      }
      reservas_turnera: {
        Row: {
          acepto_politica: boolean
          admin_visto_at: string | null
          alumno_id: string | null
          apellido: string
          celular: string | null
          coach_aviso_enviado_at: string | null
          coach_id: string
          coach_recordatorio_enviado_at: string | null
          comprobante_subido_at: string | null
          comprobante_url: string | null
          confirmacion_enviado_at: string | null
          created_at: string
          documento: string | null
          email: string
          email_expiracion_enviado_at: string | null
          email_instrucciones_enviado_at: string | null
          estado_economico: string
          estado_operativo: string
          fecha: string
          fecha_nacimiento: string | null
          form_responses: Json
          google_event_id: string | null
          google_sync_error: string | null
          google_sync_status: string | null
          google_synced_at: string | null
          hold_expira_at: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          metodo_pago: string | null
          moneda_snapshot: string | null
          motivo_rechazo: string | null
          nombre: string
          nota: string | null
          origen_link: string | null
          pago_estado: string | null
          pago_monto: number | null
          pago_mp_payment_id: string | null
          pago_mp_preference_id: string | null
          precio_snapshot: number | null
          recordatorio_15min_enviado_at: string | null
          recordatorio_enviado_at: string | null
          sede_id: string | null
          servicio_id: string
          updated_at: string
          upload_token: string | null
          verificado_at: string | null
          verificado_por: string | null
        }
        Insert: {
          acepto_politica?: boolean
          admin_visto_at?: string | null
          alumno_id?: string | null
          apellido: string
          celular?: string | null
          coach_aviso_enviado_at?: string | null
          coach_id: string
          coach_recordatorio_enviado_at?: string | null
          comprobante_subido_at?: string | null
          comprobante_url?: string | null
          confirmacion_enviado_at?: string | null
          created_at?: string
          documento?: string | null
          email: string
          email_expiracion_enviado_at?: string | null
          email_instrucciones_enviado_at?: string | null
          estado_economico?: string
          estado_operativo?: string
          fecha: string
          fecha_nacimiento?: string | null
          form_responses?: Json
          google_event_id?: string | null
          google_sync_error?: string | null
          google_sync_status?: string | null
          google_synced_at?: string | null
          hold_expira_at?: string | null
          hora_fin: string
          hora_inicio: string
          id?: string
          metodo_pago?: string | null
          moneda_snapshot?: string | null
          motivo_rechazo?: string | null
          nombre: string
          nota?: string | null
          origen_link?: string | null
          pago_estado?: string | null
          pago_monto?: number | null
          pago_mp_payment_id?: string | null
          pago_mp_preference_id?: string | null
          precio_snapshot?: number | null
          recordatorio_15min_enviado_at?: string | null
          recordatorio_enviado_at?: string | null
          sede_id?: string | null
          servicio_id: string
          updated_at?: string
          upload_token?: string | null
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Update: {
          acepto_politica?: boolean
          admin_visto_at?: string | null
          alumno_id?: string | null
          apellido?: string
          celular?: string | null
          coach_aviso_enviado_at?: string | null
          coach_id?: string
          coach_recordatorio_enviado_at?: string | null
          comprobante_subido_at?: string | null
          comprobante_url?: string | null
          confirmacion_enviado_at?: string | null
          created_at?: string
          documento?: string | null
          email?: string
          email_expiracion_enviado_at?: string | null
          email_instrucciones_enviado_at?: string | null
          estado_economico?: string
          estado_operativo?: string
          fecha?: string
          fecha_nacimiento?: string | null
          form_responses?: Json
          google_event_id?: string | null
          google_sync_error?: string | null
          google_sync_status?: string | null
          google_synced_at?: string | null
          hold_expira_at?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          metodo_pago?: string | null
          moneda_snapshot?: string | null
          motivo_rechazo?: string | null
          nombre?: string
          nota?: string | null
          origen_link?: string | null
          pago_estado?: string | null
          pago_monto?: number | null
          pago_mp_payment_id?: string | null
          pago_mp_preference_id?: string | null
          precio_snapshot?: number | null
          recordatorio_15min_enviado_at?: string | null
          recordatorio_enviado_at?: string | null
          sede_id?: string | null
          servicio_id?: string
          updated_at?: string
          upload_token?: string | null
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_turnera_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_turnera_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "reservas_turnera_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "reservas_turnera_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_turnera_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_turnera_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_turnera_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_turnera"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_addons: {
        Row: {
          added_by: string | null
          addon_id: string
          cantidad: number
          created_at: string
          currency: string
          id: string
          notas: string | null
          precio_unitario: number
          reservation_id: string
          subtotal: number
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          addon_id: string
          cantidad?: number
          created_at?: string
          currency?: string
          id?: string
          notas?: string | null
          precio_unitario?: number
          reservation_id: string
          subtotal?: number
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          addon_id?: string
          cantidad?: number
          created_at?: string
          currency?: string
          id?: string
          notas?: string | null
          precio_unitario?: number
          reservation_id?: string
          subtotal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "event_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_addons_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_addons_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_cash_announcements: {
        Row: {
          actor_type: string | null
          alumno_id: string | null
          amount: number
          concepto: string
          created_at: string
          created_by: string | null
          currency: string
          external_participant_id: string | null
          fecha_limite: string | null
          id: string
          installment_number: number | null
          lugar_previsto: string | null
          nota_libre: string | null
          payment_id: string | null
          reservation_id: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_motivo: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actor_type?: string | null
          alumno_id?: string | null
          amount: number
          concepto: string
          created_at?: string
          created_by?: string | null
          currency: string
          external_participant_id?: string | null
          fecha_limite?: string | null
          id?: string
          installment_number?: number | null
          lugar_previsto?: string | null
          nota_libre?: string | null
          payment_id?: string | null
          reservation_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_motivo?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actor_type?: string | null
          alumno_id?: string | null
          amount?: number
          concepto?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          external_participant_id?: string | null
          fecha_limite?: string | null
          id?: string
          installment_number?: number | null
          lugar_previsto?: string | null
          nota_libre?: string | null
          payment_id?: string | null
          reservation_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_motivo?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_cash_announcements_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_cash_announcements_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_checklist_data: {
        Row: {
          alumno_id: string | null
          completed: boolean
          created_at: string
          data: Json
          file_url: string | null
          id: string
          needs_advice: boolean
          reservation_id: string
          step_key: string
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          completed?: boolean
          created_at?: string
          data?: Json
          file_url?: string | null
          id?: string
          needs_advice?: boolean
          reservation_id: string
          step_key: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          completed?: boolean
          created_at?: string
          data?: Json
          file_url?: string | null
          id?: string
          needs_advice?: boolean
          reservation_id?: string
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_checklist_data_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_checklist_data_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "reservation_checklist_data_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "reservation_checklist_data_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_checklist_data_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_financial_adjustments: {
        Row: {
          alumno_id: string | null
          created_at: string
          created_by: string | null
          estado: string
          event_id: string
          id: string
          moneda: string
          monto_disponible: number
          monto_original: number
          motivo: string | null
          origen_cambio_id: string | null
          reservation_id: string
          tipo: string
          updated_at: string
          vence_el: string | null
        }
        Insert: {
          alumno_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          event_id: string
          id?: string
          moneda?: string
          monto_disponible?: number
          monto_original: number
          motivo?: string | null
          origen_cambio_id?: string | null
          reservation_id: string
          tipo: string
          updated_at?: string
          vence_el?: string | null
        }
        Update: {
          alumno_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          event_id?: string
          id?: string
          moneda?: string
          monto_disponible?: number
          monto_original?: number
          motivo?: string | null
          origen_cambio_id?: string | null
          reservation_id?: string
          tipo?: string
          updated_at?: string
          vence_el?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_financial_adjustments_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_financial_adjustments_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "reservation_financial_adjustments_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "reservation_financial_adjustments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_financial_adjustments_origen_cambio_id_fkey"
            columns: ["origen_cambio_id"]
            isOneToOne: false
            referencedRelation: "event_package_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_financial_adjustments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_financial_adjustments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_installment_history: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          changed_at: string
          changed_by: string | null
          id: string
          new_installment_id: string | null
          payment_id: string | null
          previous_installment_id: string | null
          reason: string
          reservation_id: string
          reservation_installment_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_installment_id?: string | null
          payment_id?: string | null
          previous_installment_id?: string | null
          reason: string
          reservation_id: string
          reservation_installment_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_installment_id?: string | null
          payment_id?: string | null
          previous_installment_id?: string | null
          reason?: string
          reservation_id?: string
          reservation_installment_id?: string | null
        }
        Relationships: []
      }
      reservation_installment_reminders: {
        Row: {
          channel: Database["public"]["Enums"]["installment_reminder_channel"]
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          offset_days: number
          recipient_email: string | null
          recipient_type: Database["public"]["Enums"]["installment_reminder_recipient"]
          reservation_installment_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["installment_reminder_status"]
        }
        Insert: {
          channel: Database["public"]["Enums"]["installment_reminder_channel"]
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          offset_days: number
          recipient_email?: string | null
          recipient_type: Database["public"]["Enums"]["installment_reminder_recipient"]
          reservation_installment_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["installment_reminder_status"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["installment_reminder_channel"]
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          offset_days?: number
          recipient_email?: string | null
          recipient_type?: Database["public"]["Enums"]["installment_reminder_recipient"]
          reservation_installment_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["installment_reminder_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reservation_installment_reminde_reservation_installment_id_fkey"
            columns: ["reservation_installment_id"]
            isOneToOne: false
            referencedRelation: "reservation_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_installments: {
        Row: {
          amount: number
          balance_due: number
          condoned_amount: number
          condoned_at: string | null
          condoned_by: string | null
          created_at: string
          currency: string
          due_date: string | null
          due_date_original: string | null
          event_installment_id: string | null
          external_payment_url: string | null
          id: string
          installment_number: number
          installment_type: Database["public"]["Enums"]["installment_type_enum"]
          label: string
          monto_original: number | null
          monto_pagado: number
          notas: string | null
          original_due_date: string | null
          paid_amount: number
          reprogramada_at: string | null
          reprogramada_por: string | null
          rescheduled_at: string | null
          rescheduled_by: string | null
          rescheduled_from_due_date: string | null
          reservation_id: string
          saldo_pendiente: number | null
          sort_order: number
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          balance_due?: number
          condoned_amount?: number
          condoned_at?: string | null
          condoned_by?: string | null
          created_at?: string
          currency: string
          due_date?: string | null
          due_date_original?: string | null
          event_installment_id?: string | null
          external_payment_url?: string | null
          id?: string
          installment_number: number
          installment_type?: Database["public"]["Enums"]["installment_type_enum"]
          label: string
          monto_original?: number | null
          monto_pagado?: number
          notas?: string | null
          original_due_date?: string | null
          paid_amount?: number
          reprogramada_at?: string | null
          reprogramada_por?: string | null
          rescheduled_at?: string | null
          rescheduled_by?: string | null
          rescheduled_from_due_date?: string | null
          reservation_id: string
          saldo_pendiente?: number | null
          sort_order?: number
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          balance_due?: number
          condoned_amount?: number
          condoned_at?: string | null
          condoned_by?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          due_date_original?: string | null
          event_installment_id?: string | null
          external_payment_url?: string | null
          id?: string
          installment_number?: number
          installment_type?: Database["public"]["Enums"]["installment_type_enum"]
          label?: string
          monto_original?: number | null
          monto_pagado?: number
          notas?: string | null
          original_due_date?: string | null
          paid_amount?: number
          reprogramada_at?: string | null
          reprogramada_por?: string | null
          rescheduled_at?: string | null
          rescheduled_by?: string | null
          rescheduled_from_due_date?: string | null
          reservation_id?: string
          saldo_pendiente?: number | null
          sort_order?: number
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_installments_event_installment_id_fkey"
            columns: ["event_installment_id"]
            isOneToOne: false
            referencedRelation: "event_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_installments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_installments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_notifications: {
        Row: {
          alumno_id: string | null
          asunto: string
          canal: string
          contenido: string
          created_at: string
          enviado_por: string | null
          enviado_por_email: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          reservation_id: string
          tipo: string
        }
        Insert: {
          alumno_id?: string | null
          asunto: string
          canal?: string
          contenido: string
          created_at?: string
          enviado_por?: string | null
          enviado_por_email?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          reservation_id: string
          tipo?: string
        }
        Update: {
          alumno_id?: string | null
          asunto?: string
          canal?: string
          contenido?: string
          created_at?: string
          enviado_por?: string | null
          enviado_por_email?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          reservation_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_notifications_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_notifications_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "reservation_notifications_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "reservation_notifications_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_notifications_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_payment_changes: {
        Row: {
          action: string
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          field_changed: string | null
          id: string
          new_value: string | null
          old_value: string | null
          payment_id: string
          reason: string | null
          reservation_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          payment_id: string
          reason?: string | null
          reservation_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          payment_id?: string
          reason?: string | null
          reservation_id?: string
        }
        Relationships: []
      }
      reservation_payment_intents: {
        Row: {
          actor_type: string | null
          amount: number
          concepto: string
          created_at: string
          created_by: string | null
          currency: string
          expires_at: string
          id: string
          init_point: string | null
          installment_number: number | null
          payload: Json | null
          preference_id: string | null
          reservation_id: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actor_type?: string | null
          amount: number
          concepto: string
          created_at?: string
          created_by?: string | null
          currency: string
          expires_at?: string
          id?: string
          init_point?: string | null
          installment_number?: number | null
          payload?: Json | null
          preference_id?: string | null
          reservation_id: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actor_type?: string | null
          amount?: number
          concepto?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string
          id?: string
          init_point?: string | null
          installment_number?: number | null
          payload?: Json | null
          preference_id?: string | null
          reservation_id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_payment_intents_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_payment_intents_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_payments: {
        Row: {
          alumno_id: string | null
          amount: number
          anulado_at: string | null
          anulado_motivo: string | null
          anulado_por: string | null
          comision_mp: number | null
          created_at: string
          cuenta_mp_id: string | null
          currency: string
          equivalent_amount_event_currency: number | null
          event_currency: string | null
          exchange_rate_to_event_currency: number | null
          fees_synced_at: string | null
          id: string
          iibb: number | null
          installment_id: string | null
          installment_number: number | null
          manual_override: boolean
          mp_payment_id: string | null
          neto_recibido: number | null
          notes: string | null
          original_amount: number | null
          original_currency: string | null
          otros_fees: number | null
          payment_date: string
          payment_method: string
          payment_reference: string | null
          proof_url: string | null
          reservation_id: string
          review_action: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          alumno_id?: string | null
          amount: number
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          comision_mp?: number | null
          created_at?: string
          cuenta_mp_id?: string | null
          currency?: string
          equivalent_amount_event_currency?: number | null
          event_currency?: string | null
          exchange_rate_to_event_currency?: number | null
          fees_synced_at?: string | null
          id?: string
          iibb?: number | null
          installment_id?: string | null
          installment_number?: number | null
          manual_override?: boolean
          mp_payment_id?: string | null
          neto_recibido?: number | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          otros_fees?: number | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          proof_url?: string | null
          reservation_id: string
          review_action?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          alumno_id?: string | null
          amount?: number
          anulado_at?: string | null
          anulado_motivo?: string | null
          anulado_por?: string | null
          comision_mp?: number | null
          created_at?: string
          cuenta_mp_id?: string | null
          currency?: string
          equivalent_amount_event_currency?: number | null
          event_currency?: string | null
          exchange_rate_to_event_currency?: number | null
          fees_synced_at?: string | null
          id?: string
          iibb?: number | null
          installment_id?: string | null
          installment_number?: number | null
          manual_override?: boolean
          mp_payment_id?: string | null
          neto_recibido?: number | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          otros_fees?: number | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          proof_url?: string | null
          reservation_id?: string
          review_action?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_payments_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_payments_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "reservation_payments_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "reservation_payments_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "reservation_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_roommates: {
        Row: {
          alumno_id: string | null
          confirmado: boolean
          created_at: string
          email: string | null
          event_id: string | null
          id: string
          invited_by_alumno_id: string | null
          nombre: string
          posicion: number
          reservation_id: string
          status: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          confirmado?: boolean
          created_at?: string
          email?: string | null
          event_id?: string | null
          id?: string
          invited_by_alumno_id?: string | null
          nombre: string
          posicion: number
          reservation_id: string
          status?: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          confirmado?: boolean
          created_at?: string
          email?: string | null
          event_id?: string | null
          id?: string
          invited_by_alumno_id?: string | null
          nombre?: string
          posicion?: number
          reservation_id?: string
          status?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_roommates_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_roommates_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "reservation_roommates_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "reservation_roommates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_roommates_invited_by_alumno_id_fkey"
            columns: ["invited_by_alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_roommates_invited_by_alumno_id_fkey"
            columns: ["invited_by_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "reservation_roommates_invited_by_alumno_id_fkey"
            columns: ["invited_by_alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "reservation_roommates_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_roommates_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      reservation_status_history: {
        Row: {
          changed_by: string | null
          changed_by_role: string | null
          created_at: string
          id: string
          new_payment_status: string | null
          new_reservation_status: string | null
          note: string | null
          old_payment_status: string | null
          old_reservation_status: string | null
          reservation_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string
          id?: string
          new_payment_status?: string | null
          new_reservation_status?: string | null
          note?: string | null
          old_payment_status?: string | null
          old_reservation_status?: string | null
          reservation_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string
          id?: string
          new_payment_status?: string | null
          new_reservation_status?: string | null
          note?: string | null
          old_payment_status?: string | null
          old_reservation_status?: string | null
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_status_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_status_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "v_reservation_account"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      roadbook_prospect_links: {
        Row: {
          apellido: string
          created_at: string
          created_by: string | null
          email: string
          event_id: string
          expires_at: string
          id: string
          nombre: string
          open_count: number
          opened_at: string | null
          token: string
        }
        Insert: {
          apellido: string
          created_at?: string
          created_by?: string | null
          email: string
          event_id: string
          expires_at: string
          id?: string
          nombre: string
          open_count?: number
          opened_at?: string | null
          token: string
        }
        Update: {
          apellido?: string
          created_at?: string
          created_by?: string | null
          email?: string
          event_id?: string
          expires_at?: string
          id?: string
          nombre?: string
          open_count?: number
          opened_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadbook_prospect_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      roadbook_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          roadbook: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
          roadbook: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          roadbook?: Json
          updated_at?: string
        }
        Relationships: []
      }
      scan_incidents: {
        Row: {
          accion_resolucion: string | null
          codigo: string
          created_at: string
          detalle: string | null
          estado: string
          id: string
          motivo: string
          resolved_at: string | null
          resolved_barcode_id: string | null
          resolved_by: string | null
          scanned_by: string | null
          supplier_order_id: string | null
          supplier_order_item_id: string | null
          updated_at: string
        }
        Insert: {
          accion_resolucion?: string | null
          codigo: string
          created_at?: string
          detalle?: string | null
          estado?: string
          id?: string
          motivo: string
          resolved_at?: string | null
          resolved_barcode_id?: string | null
          resolved_by?: string | null
          scanned_by?: string | null
          supplier_order_id?: string | null
          supplier_order_item_id?: string | null
          updated_at?: string
        }
        Update: {
          accion_resolucion?: string | null
          codigo?: string
          created_at?: string
          detalle?: string | null
          estado?: string
          id?: string
          motivo?: string
          resolved_at?: string | null
          resolved_barcode_id?: string | null
          resolved_by?: string | null
          scanned_by?: string | null
          supplier_order_id?: string | null
          supplier_order_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_incidents_resolved_barcode_id_fkey"
            columns: ["resolved_barcode_id"]
            isOneToOne: false
            referencedRelation: "product_barcodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_incidents_supplier_order_id_fkey"
            columns: ["supplier_order_id"]
            isOneToOne: false
            referencedRelation: "supplier_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_incidents_supplier_order_item_id_fkey"
            columns: ["supplier_order_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sedes: {
        Row: {
          activa: boolean
          ciudad: string | null
          created_at: string
          direccion: string | null
          id: string
          nombre: string
          provincia: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          ciudad?: string | null
          created_at?: string
          direccion?: string | null
          id?: string
          nombre: string
          provincia?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          ciudad?: string | null
          created_at?: string
          direccion?: string | null
          id?: string
          nombre?: string
          provincia?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      servicios_turnera: {
        Row: {
          activo: boolean
          anticipacion_horas_minima: number
          archivado: boolean
          coach_recordatorio_horas_antes: number
          created_at: string
          descripcion: string | null
          duracion_minutos: number
          email_coach_enabled: boolean
          email_coach_recordatorio_enabled: boolean
          email_confirmacion_enabled: boolean
          email_recordatorio_enabled: boolean
          form_fields: Json
          ics_adjunto: boolean
          id: string
          modalidad: string | null
          moneda: string
          nombre: string
          pago_modo: string
          pago_monto_sena: number | null
          politica_cancelacion: string | null
          precio: number | null
          recordatorio_horas_antes: number
          sede_id: string | null
          slug: string
          tipo_actividad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          anticipacion_horas_minima?: number
          archivado?: boolean
          coach_recordatorio_horas_antes?: number
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number
          email_coach_enabled?: boolean
          email_coach_recordatorio_enabled?: boolean
          email_confirmacion_enabled?: boolean
          email_recordatorio_enabled?: boolean
          form_fields?: Json
          ics_adjunto?: boolean
          id?: string
          modalidad?: string | null
          moneda?: string
          nombre: string
          pago_modo?: string
          pago_monto_sena?: number | null
          politica_cancelacion?: string | null
          precio?: number | null
          recordatorio_horas_antes?: number
          sede_id?: string | null
          slug: string
          tipo_actividad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          anticipacion_horas_minima?: number
          archivado?: boolean
          coach_recordatorio_horas_antes?: number
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number
          email_coach_enabled?: boolean
          email_coach_recordatorio_enabled?: boolean
          email_confirmacion_enabled?: boolean
          email_recordatorio_enabled?: boolean
          form_fields?: Json
          ics_adjunto?: boolean
          id?: string
          modalidad?: string | null
          moneda?: string
          nombre?: string
          pago_modo?: string
          pago_monto_sena?: number | null
          politica_cancelacion?: string | null
          precio?: number | null
          recordatorio_horas_antes?: number
          sede_id?: string | null
          slug?: string
          tipo_actividad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_turnera_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones_extra: {
        Row: {
          alumno_id: string
          comentario: string | null
          created_at: string
          duracion_minutos: number | null
          fecha: string
          id: string
          nombre: string | null
          tipo: string
        }
        Insert: {
          alumno_id: string
          comentario?: string | null
          created_at?: string
          duracion_minutos?: number | null
          fecha: string
          id?: string
          nombre?: string | null
          tipo?: string
        }
        Update: {
          alumno_id?: string
          comentario?: string | null
          created_at?: string
          duracion_minutos?: number | null
          fecha?: string
          id?: string
          nombre?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sesiones_extra_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_extra_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "sesiones_extra_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      solicitudes_cambio_plan: {
        Row: {
          alumno_id: string
          created_at: string
          diferencia: number | null
          estado: string
          id: string
          nota: string | null
          plan_actual_id: string | null
          plan_actual_nombre: string | null
          plan_nuevo_id: string | null
          plan_nuevo_nombre: string | null
          resuelto_at: string | null
          resuelto_por: string | null
          scope: string
          sub_actual_id: string | null
          sub_nueva_id: string | null
        }
        Insert: {
          alumno_id: string
          created_at?: string
          diferencia?: number | null
          estado?: string
          id?: string
          nota?: string | null
          plan_actual_id?: string | null
          plan_actual_nombre?: string | null
          plan_nuevo_id?: string | null
          plan_nuevo_nombre?: string | null
          resuelto_at?: string | null
          resuelto_por?: string | null
          scope?: string
          sub_actual_id?: string | null
          sub_nueva_id?: string | null
        }
        Update: {
          alumno_id?: string
          created_at?: string
          diferencia?: number | null
          estado?: string
          id?: string
          nota?: string | null
          plan_actual_id?: string | null
          plan_actual_nombre?: string | null
          plan_nuevo_id?: string | null
          plan_nuevo_nombre?: string | null
          resuelto_at?: string | null
          resuelto_por?: string | null
          scope?: string
          sub_actual_id?: string | null
          sub_nueva_id?: string | null
        }
        Relationships: []
      }
      stock_count_items: {
        Row: {
          contado: number | null
          count_id: string
          created_at: string
          diferencia: number | null
          esperado: number | null
          id: string
          movement_id: string | null
          product_id: string | null
          product_name: string | null
          variante: string | null
        }
        Insert: {
          contado?: number | null
          count_id: string
          created_at?: string
          diferencia?: number | null
          esperado?: number | null
          id?: string
          movement_id?: string | null
          product_id?: string | null
          product_name?: string | null
          variante?: string | null
        }
        Update: {
          contado?: number | null
          count_id?: string
          created_at?: string
          diferencia?: number | null
          esperado?: number | null
          id?: string
          movement_id?: string | null
          product_id?: string | null
          product_name?: string | null
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          categoria: string | null
          confirmado_por: string | null
          confirmado_por_nombre: string | null
          created_at: string
          estado: string
          finalizado_at: string | null
          id: string
          items_coinciden: number
          items_diferencia: number
          items_sin_contar: number
          movimientos_generados: number
          observaciones: string | null
          reporte: string | null
          total_items: number
          unidades_faltantes: number
          unidades_sobrantes: number
        }
        Insert: {
          categoria?: string | null
          confirmado_por?: string | null
          confirmado_por_nombre?: string | null
          created_at?: string
          estado?: string
          finalizado_at?: string | null
          id?: string
          items_coinciden?: number
          items_diferencia?: number
          items_sin_contar?: number
          movimientos_generados?: number
          observaciones?: string | null
          reporte?: string | null
          total_items?: number
          unidades_faltantes?: number
          unidades_sobrantes?: number
        }
        Update: {
          categoria?: string | null
          confirmado_por?: string | null
          confirmado_por_nombre?: string | null
          created_at?: string
          estado?: string
          finalizado_at?: string | null
          id?: string
          items_coinciden?: number
          items_diferencia?: number
          items_sin_contar?: number
          movimientos_generados?: number
          observaciones?: string | null
          reporte?: string | null
          total_items?: number
          unidades_faltantes?: number
          unidades_sobrantes?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          cambio_id: string | null
          cantidad: number
          created_at: string
          id: string
          metodo: Database["public"]["Enums"]["cambio_metodo"] | null
          motivo: string | null
          order_id: string | null
          order_item_id: string | null
          product_id: string
          registrado_por: string | null
          reversa_de_movimiento_id: string | null
          stock_anterior: number
          stock_nuevo: number
          tipo: string
          variante: string | null
        }
        Insert: {
          cambio_id?: string | null
          cantidad: number
          created_at?: string
          id?: string
          metodo?: Database["public"]["Enums"]["cambio_metodo"] | null
          motivo?: string | null
          order_id?: string | null
          order_item_id?: string | null
          product_id: string
          registrado_por?: string | null
          reversa_de_movimiento_id?: string | null
          stock_anterior: number
          stock_nuevo: number
          tipo?: string
          variante?: string | null
        }
        Update: {
          cambio_id?: string | null
          cantidad?: number
          created_at?: string
          id?: string
          metodo?: Database["public"]["Enums"]["cambio_metodo"] | null
          motivo?: string | null
          order_id?: string | null
          order_item_id?: string | null
          product_id?: string
          registrado_por?: string | null
          reversa_de_movimiento_id?: string | null
          stock_anterior?: number
          stock_nuevo?: number
          tipo?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_cambio_id_fkey"
            columns: ["cambio_id"]
            isOneToOne: false
            referencedRelation: "store_cambios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reversa_fk"
            columns: ["reversa_de_movimiento_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      store_banners: {
        Row: {
          active: boolean
          button_text: string | null
          created_at: string
          end_date: string | null
          id: string
          image_url: string | null
          link_url: string | null
          sort_order: number
          start_date: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          button_text?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          sort_order?: number
          start_date?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          button_text?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          sort_order?: number
          start_date?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_cambios: {
        Row: {
          admin_iniciador_id: string | null
          alumno_id: string
          aprobado_at: string | null
          cerrado_at: string | null
          comentario: string | null
          compra_id: string | null
          created_at: string
          diferencia_precio: number
          en_deposito_at: string | null
          entregado_at: string | null
          estado: Database["public"]["Enums"]["cambio_estado"]
          estado_pago_diferencia: string
          fotos: string[]
          historial: Json
          id: string
          iniciado_por: Database["public"]["Enums"]["cambio_iniciador"]
          listo_retiro_at: string | null
          metodo_entrega_reemplazo:
            | Database["public"]["Enums"]["cambio_metodo"]
            | null
          metodo_recepcion: Database["public"]["Enums"]["cambio_metodo"] | null
          moneda: string
          motivo: Database["public"]["Enums"]["cambio_motivo"]
          motivo_admin: string | null
          mp_payment_id: string | null
          notificar_alumno: boolean
          order_id: string | null
          origen_solicitud: Database["public"]["Enums"]["cambio_origen"]
          origen_tipo: string
          preorder_id: string | null
          producto_id: string
          producto_reemplazo_id: string | null
          recibido_en: string | null
          recibido_por: string | null
          reemplazo_estado: Database["public"]["Enums"]["cambio_reemplazo_estado"]
          responsable_admin_id: string | null
          responsable_deposito_id: string | null
          stock_descontado_at: string | null
          stock_devuelto_at: string | null
          updated_at: string
          variante_destino: Json | null
          variante_origen: Json
        }
        Insert: {
          admin_iniciador_id?: string | null
          alumno_id: string
          aprobado_at?: string | null
          cerrado_at?: string | null
          comentario?: string | null
          compra_id?: string | null
          created_at?: string
          diferencia_precio?: number
          en_deposito_at?: string | null
          entregado_at?: string | null
          estado?: Database["public"]["Enums"]["cambio_estado"]
          estado_pago_diferencia?: string
          fotos?: string[]
          historial?: Json
          id?: string
          iniciado_por?: Database["public"]["Enums"]["cambio_iniciador"]
          listo_retiro_at?: string | null
          metodo_entrega_reemplazo?:
            | Database["public"]["Enums"]["cambio_metodo"]
            | null
          metodo_recepcion?: Database["public"]["Enums"]["cambio_metodo"] | null
          moneda?: string
          motivo: Database["public"]["Enums"]["cambio_motivo"]
          motivo_admin?: string | null
          mp_payment_id?: string | null
          notificar_alumno?: boolean
          order_id?: string | null
          origen_solicitud?: Database["public"]["Enums"]["cambio_origen"]
          origen_tipo: string
          preorder_id?: string | null
          producto_id: string
          producto_reemplazo_id?: string | null
          recibido_en?: string | null
          recibido_por?: string | null
          reemplazo_estado?: Database["public"]["Enums"]["cambio_reemplazo_estado"]
          responsable_admin_id?: string | null
          responsable_deposito_id?: string | null
          stock_descontado_at?: string | null
          stock_devuelto_at?: string | null
          updated_at?: string
          variante_destino?: Json | null
          variante_origen?: Json
        }
        Update: {
          admin_iniciador_id?: string | null
          alumno_id?: string
          aprobado_at?: string | null
          cerrado_at?: string | null
          comentario?: string | null
          compra_id?: string | null
          created_at?: string
          diferencia_precio?: number
          en_deposito_at?: string | null
          entregado_at?: string | null
          estado?: Database["public"]["Enums"]["cambio_estado"]
          estado_pago_diferencia?: string
          fotos?: string[]
          historial?: Json
          id?: string
          iniciado_por?: Database["public"]["Enums"]["cambio_iniciador"]
          listo_retiro_at?: string | null
          metodo_entrega_reemplazo?:
            | Database["public"]["Enums"]["cambio_metodo"]
            | null
          metodo_recepcion?: Database["public"]["Enums"]["cambio_metodo"] | null
          moneda?: string
          motivo?: Database["public"]["Enums"]["cambio_motivo"]
          motivo_admin?: string | null
          mp_payment_id?: string | null
          notificar_alumno?: boolean
          order_id?: string | null
          origen_solicitud?: Database["public"]["Enums"]["cambio_origen"]
          origen_tipo?: string
          preorder_id?: string | null
          producto_id?: string
          producto_reemplazo_id?: string | null
          recibido_en?: string | null
          recibido_por?: string | null
          reemplazo_estado?: Database["public"]["Enums"]["cambio_reemplazo_estado"]
          responsable_admin_id?: string | null
          responsable_deposito_id?: string | null
          stock_descontado_at?: string | null
          stock_devuelto_at?: string | null
          updated_at?: string
          variante_destino?: Json | null
          variante_origen?: Json
        }
        Relationships: [
          {
            foreignKeyName: "store_cambios_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_cambios_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "store_cambios_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "store_cambios_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_cambios_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_cambios_producto_reemplazo_id_fkey"
            columns: ["producto_reemplazo_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      store_combo_items: {
        Row: {
          combo_id: string
          component_product_id: string | null
          created_at: string
          id: string
          internal_name: string | null
          internal_price: number | null
          internal_stock: Json
          internal_variants: Json
          obligatorio: boolean
          precio_individual: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          combo_id: string
          component_product_id?: string | null
          created_at?: string
          id?: string
          internal_name?: string | null
          internal_price?: number | null
          internal_stock?: Json
          internal_variants?: Json
          obligatorio?: boolean
          precio_individual?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          combo_id?: string
          component_product_id?: string | null
          created_at?: string
          id?: string
          internal_name?: string | null
          internal_price?: number | null
          internal_stock?: Json
          internal_variants?: Json
          obligatorio?: boolean
          precio_individual?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_combo_items_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_items: {
        Row: {
          combo_item_id: string | null
          created_at: string
          id: string
          internal_component_idx: number | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          supplier_order_item_id: string | null
          supplier_ordered_at: string | null
          unit_price: number
          variant_selection: Json
        }
        Insert: {
          combo_item_id?: string | null
          created_at?: string
          id?: string
          internal_component_idx?: number | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          supplier_order_item_id?: string | null
          supplier_ordered_at?: string | null
          unit_price: number
          variant_selection?: Json
        }
        Update: {
          combo_item_id?: string | null
          created_at?: string
          id?: string
          internal_component_idx?: number | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          supplier_order_item_id?: string | null
          supplier_ordered_at?: string | null
          unit_price?: number
          variant_selection?: Json
        }
        Relationships: [
          {
            foreignKeyName: "store_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_order_items_supplier_order_item_id_fkey"
            columns: ["supplier_order_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      store_orders: {
        Row: {
          alumno_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          comision_mp: number | null
          created_at: string
          cuenta_mp_id: string | null
          currency: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          entrega_metodo: string | null
          envio_contacto: string | null
          envio_costo: number | null
          envio_direccion: string | null
          envio_estado: string | null
          envio_notas: string | null
          es_externo: boolean
          fees_synced_at: string | null
          id: string
          iibb: number | null
          metodo_pago: string | null
          mp_external_reference: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          mp_status: string | null
          neto_recibido: number | null
          notes: string | null
          order_number: number
          origen_registro: string | null
          otros_fees: number | null
          pagado_at: string | null
          sede_retiro_id: string | null
          shipping_tracking: string | null
          status: string
          stock_restored_at: string | null
          supplier_notified_at: string | null
          supplier_notified_by: string | null
          supplier_order_ref: string | null
          tienda_emisor_id: string | null
          total: number
          updated_at: string
          verificado_admin: boolean
          verificado_admin_at: string | null
          verificado_admin_by: string | null
          verificado_nota: string | null
        }
        Insert: {
          alumno_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          comision_mp?: number | null
          created_at?: string
          cuenta_mp_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivered_at?: string | null
          entrega_metodo?: string | null
          envio_contacto?: string | null
          envio_costo?: number | null
          envio_direccion?: string | null
          envio_estado?: string | null
          envio_notas?: string | null
          es_externo?: boolean
          fees_synced_at?: string | null
          id?: string
          iibb?: number | null
          metodo_pago?: string | null
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          neto_recibido?: number | null
          notes?: string | null
          order_number?: number
          origen_registro?: string | null
          otros_fees?: number | null
          pagado_at?: string | null
          sede_retiro_id?: string | null
          shipping_tracking?: string | null
          status?: string
          stock_restored_at?: string | null
          supplier_notified_at?: string | null
          supplier_notified_by?: string | null
          supplier_order_ref?: string | null
          tienda_emisor_id?: string | null
          total?: number
          updated_at?: string
          verificado_admin?: boolean
          verificado_admin_at?: string | null
          verificado_admin_by?: string | null
          verificado_nota?: string | null
        }
        Update: {
          alumno_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          comision_mp?: number | null
          created_at?: string
          cuenta_mp_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivered_at?: string | null
          entrega_metodo?: string | null
          envio_contacto?: string | null
          envio_costo?: number | null
          envio_direccion?: string | null
          envio_estado?: string | null
          envio_notas?: string | null
          es_externo?: boolean
          fees_synced_at?: string | null
          id?: string
          iibb?: number | null
          metodo_pago?: string | null
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          neto_recibido?: number | null
          notes?: string | null
          order_number?: number
          origen_registro?: string | null
          otros_fees?: number | null
          pagado_at?: string | null
          sede_retiro_id?: string | null
          shipping_tracking?: string | null
          status?: string
          stock_restored_at?: string | null
          supplier_notified_at?: string | null
          supplier_notified_by?: string | null
          supplier_order_ref?: string | null
          tienda_emisor_id?: string | null
          total?: number
          updated_at?: string
          verificado_admin?: boolean
          verificado_admin_at?: string | null
          verificado_admin_by?: string | null
          verificado_nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_orders_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_orders_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "store_orders_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "store_orders_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_orders_sede_retiro_id_fkey"
            columns: ["sede_retiro_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_orders_tienda_emisor_fkey"
            columns: ["tienda_emisor_id"]
            isOneToOne: false
            referencedRelation: "emisor_facturado_anual"
            referencedColumns: ["emisor_id"]
          },
          {
            foreignKeyName: "store_orders_tienda_emisor_fkey"
            columns: ["tienda_emisor_id"]
            isOneToOne: false
            referencedRelation: "emisores_fiscales"
            referencedColumns: ["id"]
          },
        ]
      }
      store_preorders: {
        Row: {
          alumno_dni: string | null
          alumno_email: string | null
          alumno_id: string
          alumno_nombre: string | null
          alumno_telefono: string | null
          cancelada_at: string | null
          cancelada_motivo: string | null
          cantidad: number
          created_at: string
          cuenta_mp_id: string | null
          delivered_at: string | null
          entrega_metodo: string | null
          entregada_at: string | null
          envio_contacto: string | null
          envio_costo: number | null
          envio_direccion: string | null
          envio_estado: string | null
          envio_notas: string | null
          estado: string
          estado_pago_sena: string
          forma_pago_sena: string | null
          id: string
          items: Json
          modalidad: string
          moneda: string
          mp_external_reference: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          notas: string | null
          precio_total: number
          precio_unitario: number
          product_id: string
          producto_nombre: string
          saldo_pendiente: number
          sede_retiro_id: string | null
          sena_last_reminder_at: string | null
          sena_monto: number
          sena_pagada_at: string | null
          sena_reminder_count: number
          updated_at: string
          variante: Json
        }
        Insert: {
          alumno_dni?: string | null
          alumno_email?: string | null
          alumno_id: string
          alumno_nombre?: string | null
          alumno_telefono?: string | null
          cancelada_at?: string | null
          cancelada_motivo?: string | null
          cantidad?: number
          created_at?: string
          cuenta_mp_id?: string | null
          delivered_at?: string | null
          entrega_metodo?: string | null
          entregada_at?: string | null
          envio_contacto?: string | null
          envio_costo?: number | null
          envio_direccion?: string | null
          envio_estado?: string | null
          envio_notas?: string | null
          estado?: string
          estado_pago_sena?: string
          forma_pago_sena?: string | null
          id?: string
          items?: Json
          modalidad?: string
          moneda?: string
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notas?: string | null
          precio_total: number
          precio_unitario: number
          product_id: string
          producto_nombre: string
          saldo_pendiente: number
          sede_retiro_id?: string | null
          sena_last_reminder_at?: string | null
          sena_monto: number
          sena_pagada_at?: string | null
          sena_reminder_count?: number
          updated_at?: string
          variante?: Json
        }
        Update: {
          alumno_dni?: string | null
          alumno_email?: string | null
          alumno_id?: string
          alumno_nombre?: string | null
          alumno_telefono?: string | null
          cancelada_at?: string | null
          cancelada_motivo?: string | null
          cantidad?: number
          created_at?: string
          cuenta_mp_id?: string | null
          delivered_at?: string | null
          entrega_metodo?: string | null
          entregada_at?: string | null
          envio_contacto?: string | null
          envio_costo?: number | null
          envio_direccion?: string | null
          envio_estado?: string | null
          envio_notas?: string | null
          estado?: string
          estado_pago_sena?: string
          forma_pago_sena?: string | null
          id?: string
          items?: Json
          modalidad?: string
          moneda?: string
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notas?: string | null
          precio_total?: number
          precio_unitario?: number
          product_id?: string
          producto_nombre?: string
          saldo_pendiente?: number
          sede_retiro_id?: string | null
          sena_last_reminder_at?: string | null
          sena_monto?: number
          sena_pagada_at?: string | null
          sena_reminder_count?: number
          updated_at?: string
          variante?: Json
        }
        Relationships: [
          {
            foreignKeyName: "store_preorders_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_preorders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_preorders_sede_retiro_id_fkey"
            columns: ["sede_retiro_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      store_products: {
        Row: {
          category_id: string | null
          checkout_mode: string
          combo_price: number | null
          combo_pricing_mode: string
          costo: number | null
          costo_moneda: string | null
          created_at: string
          currency: string
          delivery_methods: Json
          description: string | null
          descuento_pct: number | null
          discount: number | null
          entrega_estimada_dias: number | null
          es_externo: boolean
          external_url: string | null
          featured: boolean
          featured_order: number | null
          id: string
          image_url: string | null
          is_combo: boolean
          is_preorder: boolean
          marca: string | null
          min_stock: number
          name: string
          no_admite_cambio: boolean
          old_price: number | null
          pickup_sede_ids: string[]
          precio_oficial: number | null
          preorder_deadline: string | null
          preorder_deposit_amount: number | null
          preorder_deposit_percent: number | null
          preorder_description: string | null
          preorder_estimated_delivery: string | null
          preorder_status: string
          preorder_total_units: number | null
          preorder_variants: Json
          price: number
          promo_activa: boolean
          proveedor: string | null
          sena_mode: string | null
          sena_valor: number | null
          sku_base: string | null
          source_url: string | null
          status: string
          stock: number
          supplier_id: string | null
          tag: string | null
          tienda_emisor_id: string | null
          updated_at: string
          variant_stock: Json
          variants: Json
        }
        Insert: {
          category_id?: string | null
          checkout_mode?: string
          combo_price?: number | null
          combo_pricing_mode?: string
          costo?: number | null
          costo_moneda?: string | null
          created_at?: string
          currency?: string
          delivery_methods?: Json
          description?: string | null
          descuento_pct?: number | null
          discount?: number | null
          entrega_estimada_dias?: number | null
          es_externo?: boolean
          external_url?: string | null
          featured?: boolean
          featured_order?: number | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          is_preorder?: boolean
          marca?: string | null
          min_stock?: number
          name: string
          no_admite_cambio?: boolean
          old_price?: number | null
          pickup_sede_ids?: string[]
          precio_oficial?: number | null
          preorder_deadline?: string | null
          preorder_deposit_amount?: number | null
          preorder_deposit_percent?: number | null
          preorder_description?: string | null
          preorder_estimated_delivery?: string | null
          preorder_status?: string
          preorder_total_units?: number | null
          preorder_variants?: Json
          price: number
          promo_activa?: boolean
          proveedor?: string | null
          sena_mode?: string | null
          sena_valor?: number | null
          sku_base?: string | null
          source_url?: string | null
          status?: string
          stock?: number
          supplier_id?: string | null
          tag?: string | null
          tienda_emisor_id?: string | null
          updated_at?: string
          variant_stock?: Json
          variants?: Json
        }
        Update: {
          category_id?: string | null
          checkout_mode?: string
          combo_price?: number | null
          combo_pricing_mode?: string
          costo?: number | null
          costo_moneda?: string | null
          created_at?: string
          currency?: string
          delivery_methods?: Json
          description?: string | null
          descuento_pct?: number | null
          discount?: number | null
          entrega_estimada_dias?: number | null
          es_externo?: boolean
          external_url?: string | null
          featured?: boolean
          featured_order?: number | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          is_preorder?: boolean
          marca?: string | null
          min_stock?: number
          name?: string
          no_admite_cambio?: boolean
          old_price?: number | null
          pickup_sede_ids?: string[]
          precio_oficial?: number | null
          preorder_deadline?: string | null
          preorder_deposit_amount?: number | null
          preorder_deposit_percent?: number | null
          preorder_description?: string | null
          preorder_estimated_delivery?: string | null
          preorder_status?: string
          preorder_total_units?: number | null
          preorder_variants?: Json
          price?: number
          promo_activa?: boolean
          proveedor?: string | null
          sena_mode?: string | null
          sena_valor?: number | null
          sku_base?: string | null
          source_url?: string | null
          status?: string
          stock?: number
          supplier_id?: string | null
          tag?: string | null
          tienda_emisor_id?: string | null
          updated_at?: string
          variant_stock?: Json
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "store_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "store_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "store_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_products_tienda_emisor_fkey"
            columns: ["tienda_emisor_id"]
            isOneToOne: false
            referencedRelation: "emisor_facturado_anual"
            referencedColumns: ["emisor_id"]
          },
          {
            foreignKeyName: "store_products_tienda_emisor_fkey"
            columns: ["tienda_emisor_id"]
            isOneToOne: false
            referencedRelation: "emisores_fiscales"
            referencedColumns: ["id"]
          },
        ]
      }
      store_quick_access: {
        Row: {
          active: boolean
          created_at: string
          filter_tag: string | null
          icon: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          filter_tag?: string | null
          icon?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          filter_tag?: string | null
          icon?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      store_suppliers: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          email_cc: string | null
          id: string
          nombre: string
          notas: string | null
          sitio_web: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          email_cc?: string | null
          id?: string
          nombre: string
          notas?: string | null
          sitio_web?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          email_cc?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          sitio_web?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_activity_log: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          actor_role: string
          alumno_id: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          reference_id: string | null
          reference_label: string | null
          reference_type: string | null
          title: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string
          alumno_id: string
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          reference_id?: string | null
          reference_label?: string | null
          reference_type?: string | null
          title: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string
          alumno_id?: string
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          reference_id?: string | null
          reference_label?: string | null
          reference_type?: string | null
          title?: string
        }
        Relationships: []
      }
      supplier_order_items: {
        Row: {
          cantidad_pedida: number
          cantidad_recibida: number
          created_at: string
          id: string
          notas: string | null
          precio_unitario: number | null
          product_id: string | null
          producto_nombre: string
          supplier_order_id: string
          updated_at: string
          variante: Json | null
        }
        Insert: {
          cantidad_pedida?: number
          cantidad_recibida?: number
          created_at?: string
          id?: string
          notas?: string | null
          precio_unitario?: number | null
          product_id?: string | null
          producto_nombre: string
          supplier_order_id: string
          updated_at?: string
          variante?: Json | null
        }
        Update: {
          cantidad_pedida?: number
          cantidad_recibida?: number
          created_at?: string
          id?: string
          notas?: string | null
          precio_unitario?: number | null
          product_id?: string | null
          producto_nombre?: string
          supplier_order_id?: string
          updated_at?: string
          variante?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_order_items_supplier_order_id_fkey"
            columns: ["supplier_order_id"]
            isOneToOne: false
            referencedRelation: "supplier_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_orders: {
        Row: {
          created_at: string
          created_by: string | null
          estado: string
          fecha_estimada_entrega: string | null
          fecha_pedido: string
          id: string
          moneda: string
          notas: string | null
          numero: string
          proveedor_contacto: string | null
          proveedor_email: string | null
          proveedor_nombre: string
          supplier_id: string | null
          total_estimado: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha_estimada_entrega?: string | null
          fecha_pedido?: string
          id?: string
          moneda?: string
          notas?: string | null
          numero?: string
          proveedor_contacto?: string | null
          proveedor_email?: string | null
          proveedor_nombre: string
          supplier_id?: string | null
          total_estimado?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha_estimada_entrega?: string | null
          fecha_pedido?: string
          id?: string
          moneda?: string
          notas?: string | null
          numero?: string
          proveedor_contacto?: string | null
          proveedor_email?: string | null
          proveedor_nombre?: string
          supplier_id?: string | null
          total_estimado?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "store_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      suscripciones: {
        Row: {
          alumno_id: string
          auto_cobro_activo: boolean
          auto_renovacion: boolean
          baja_chequeada: boolean
          baja_chequeada_at: string | null
          baja_chequeada_by: string | null
          baja_nota: string | null
          cancelada_at: string | null
          cancelada_motivo: string | null
          chequeado_admin: boolean
          chequeado_admin_at: string | null
          chequeado_admin_by: string | null
          clases_consumidas: number
          clases_totales: number | null
          clases_vencimiento: string | null
          comision_mp: number | null
          created_at: string
          cuenta_mp_id: string | null
          descuento_id: string | null
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          fees_synced_at: string | null
          id: string
          iibb: number | null
          intentos_cobro_fallidos: number
          metodo_pago: string
          mp_payment_id: string | null
          mp_preapproval_id: string | null
          mp_preapproval_status: string | null
          mp_preference_id: string | null
          mp_status: string | null
          neto_recibido: number | null
          notas: string | null
          origen_registro: string
          otros_fees: number | null
          plan_id: string
          precio_base: number | null
          precio_excepcion_at: string | null
          precio_excepcion_autorizado_por: string | null
          precio_excepcion_motivo: string | null
          precio_excepcion_tipo: string | null
          precio_excepcion_valor: number | null
          precio_excepcion_vigencia_hasta: string | null
          precio_final: number | null
          ultimo_intento_cobro_at: string | null
          updated_at: string
        }
        Insert: {
          alumno_id: string
          auto_cobro_activo?: boolean
          auto_renovacion?: boolean
          baja_chequeada?: boolean
          baja_chequeada_at?: string | null
          baja_chequeada_by?: string | null
          baja_nota?: string | null
          cancelada_at?: string | null
          cancelada_motivo?: string | null
          chequeado_admin?: boolean
          chequeado_admin_at?: string | null
          chequeado_admin_by?: string | null
          clases_consumidas?: number
          clases_totales?: number | null
          clases_vencimiento?: string | null
          comision_mp?: number | null
          created_at?: string
          cuenta_mp_id?: string | null
          descuento_id?: string | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fees_synced_at?: string | null
          id?: string
          iibb?: number | null
          intentos_cobro_fallidos?: number
          metodo_pago?: string
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          mp_preapproval_status?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          neto_recibido?: number | null
          notas?: string | null
          origen_registro?: string
          otros_fees?: number | null
          plan_id: string
          precio_base?: number | null
          precio_excepcion_at?: string | null
          precio_excepcion_autorizado_por?: string | null
          precio_excepcion_motivo?: string | null
          precio_excepcion_tipo?: string | null
          precio_excepcion_valor?: number | null
          precio_excepcion_vigencia_hasta?: string | null
          precio_final?: number | null
          ultimo_intento_cobro_at?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          auto_cobro_activo?: boolean
          auto_renovacion?: boolean
          baja_chequeada?: boolean
          baja_chequeada_at?: string | null
          baja_chequeada_by?: string | null
          baja_nota?: string | null
          cancelada_at?: string | null
          cancelada_motivo?: string | null
          chequeado_admin?: boolean
          chequeado_admin_at?: string | null
          chequeado_admin_by?: string | null
          clases_consumidas?: number
          clases_totales?: number | null
          clases_vencimiento?: string | null
          comision_mp?: number | null
          created_at?: string
          cuenta_mp_id?: string | null
          descuento_id?: string | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fees_synced_at?: string | null
          id?: string
          iibb?: number | null
          intentos_cobro_fallidos?: number
          metodo_pago?: string
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          mp_preapproval_status?: string | null
          mp_preference_id?: string | null
          mp_status?: string | null
          neto_recibido?: number | null
          notas?: string | null
          origen_registro?: string
          otros_fees?: number | null
          plan_id?: string
          precio_base?: number | null
          precio_excepcion_at?: string | null
          precio_excepcion_autorizado_por?: string | null
          precio_excepcion_motivo?: string | null
          precio_excepcion_tipo?: string | null
          precio_excepcion_valor?: number | null
          precio_excepcion_vigencia_hasta?: string | null
          precio_final?: number | null
          ultimo_intento_cobro_at?: string | null
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
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "suscripciones_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_descuento_id_fkey"
            columns: ["descuento_id"]
            isOneToOne: false
            referencedRelation: "descuentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          asignado_user_id: string | null
          cerrada_at: string | null
          cerrada_por: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          descripcion: string | null
          entidad_id: string | null
          entidad_tipo: string | null
          estado: Database["public"]["Enums"]["tarea_estado"]
          fecha_vencimiento: string | null
          id: string
          metadata: Json
          nota_cierre: string | null
          origen: string
          pospuesta_hasta: string | null
          prioridad: Database["public"]["Enums"]["tarea_prioridad"]
          rol_destino: Database["public"]["Enums"]["tarea_rol"]
          tipo: Database["public"]["Enums"]["tarea_tipo"]
          titulo: string
          updated_at: string
        }
        Insert: {
          asignado_user_id?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          descripcion?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado?: Database["public"]["Enums"]["tarea_estado"]
          fecha_vencimiento?: string | null
          id?: string
          metadata?: Json
          nota_cierre?: string | null
          origen?: string
          pospuesta_hasta?: string | null
          prioridad?: Database["public"]["Enums"]["tarea_prioridad"]
          rol_destino: Database["public"]["Enums"]["tarea_rol"]
          tipo?: Database["public"]["Enums"]["tarea_tipo"]
          titulo: string
          updated_at?: string
        }
        Update: {
          asignado_user_id?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          descripcion?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          estado?: Database["public"]["Enums"]["tarea_estado"]
          fecha_vencimiento?: string | null
          id?: string
          metadata?: Json
          nota_cierre?: string | null
          origen?: string
          pospuesta_hasta?: string | null
          prioridad?: Database["public"]["Enums"]["tarea_prioridad"]
          rol_destino?: Database["public"]["Enums"]["tarea_rol"]
          tipo?: Database["public"]["Enums"]["tarea_tipo"]
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      tareas_historial: {
        Row: {
          accion: string
          cambio: Json | null
          changed_by: string | null
          created_at: string
          estado_anterior: Database["public"]["Enums"]["tarea_estado"] | null
          estado_nuevo: Database["public"]["Enums"]["tarea_estado"] | null
          id: string
          nota: string | null
          tarea_id: string
        }
        Insert: {
          accion: string
          cambio?: Json | null
          changed_by?: string | null
          created_at?: string
          estado_anterior?: Database["public"]["Enums"]["tarea_estado"] | null
          estado_nuevo?: Database["public"]["Enums"]["tarea_estado"] | null
          id?: string
          nota?: string | null
          tarea_id: string
        }
        Update: {
          accion?: string
          cambio?: Json | null
          changed_by?: string | null
          created_at?: string
          estado_anterior?: Database["public"]["Enums"]["tarea_estado"] | null
          estado_nuevo?: Database["public"]["Enums"]["tarea_estado"] | null
          id?: string
          nota?: string | null
          tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_historial_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      training_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entries: Json
          id: string
          name: string
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entries?: Json
          id?: string
          name: string
          template_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entries?: Json
          id?: string
          name?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
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
      vehiculo_carga_items: {
        Row: {
          alumno_id: string | null
          cantidad: number
          carga_id: string
          chequeado_at: string | null
          chequeado_by: string | null
          cliente_nombre: string
          created_at: string
          entregado_at: string | null
          estado: string
          id: string
          notas: string | null
          producto: string | null
          source_id: string
          source_table: string
          updated_at: string
          variante: string | null
        }
        Insert: {
          alumno_id?: string | null
          cantidad?: number
          carga_id: string
          chequeado_at?: string | null
          chequeado_by?: string | null
          cliente_nombre: string
          created_at?: string
          entregado_at?: string | null
          estado?: string
          id?: string
          notas?: string | null
          producto?: string | null
          source_id: string
          source_table: string
          updated_at?: string
          variante?: string | null
        }
        Update: {
          alumno_id?: string | null
          cantidad?: number
          carga_id?: string
          chequeado_at?: string | null
          chequeado_by?: string | null
          cliente_nombre?: string
          created_at?: string
          entregado_at?: string | null
          estado?: string
          id?: string
          notas?: string | null
          producto?: string | null
          source_id?: string
          source_table?: string
          updated_at?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_carga_items_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "vehiculo_cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculo_cargas: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          entregador_nombre: string | null
          entregador_user_id: string | null
          estado: string
          fecha_salida: string
          id: string
          km_retorno: number | null
          km_salida: number | null
          notas: string | null
          sede_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          entregador_nombre?: string | null
          entregador_user_id?: string | null
          estado?: string
          fecha_salida?: string
          id?: string
          km_retorno?: number | null
          km_salida?: number | null
          notas?: string | null
          sede_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          entregador_nombre?: string | null
          entregador_user_id?: string | null
          estado?: string
          fecha_salida?: string
          id?: string
          km_retorno?: number | null
          km_salida?: number | null
          notas?: string | null
          sede_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_cargas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculo_chequeo_scans: {
        Row: {
          chequeo_id: string
          created_at: string
          id: string
          item_id: string
          scanned_at: string
          scanned_by: string | null
        }
        Insert: {
          chequeo_id: string
          created_at?: string
          id?: string
          item_id: string
          scanned_at?: string
          scanned_by?: string | null
        }
        Update: {
          chequeo_id?: string
          created_at?: string
          id?: string
          item_id?: string
          scanned_at?: string
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_chequeo_scans_chequeo_id_fkey"
            columns: ["chequeo_id"]
            isOneToOne: false
            referencedRelation: "vehiculo_chequeos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_chequeo_scans_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vehiculo_carga_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculo_chequeos: {
        Row: {
          carga_id: string
          closed_at: string | null
          created_at: string
          estado: string
          id: string
          notas: string | null
          responsable_nombre: string | null
          responsable_user_id: string | null
          resumen: Json | null
          ronda: number
          started_at: string
          tipo: string
          updated_at: string
        }
        Insert: {
          carga_id: string
          closed_at?: string | null
          created_at?: string
          estado?: string
          id?: string
          notas?: string | null
          responsable_nombre?: string | null
          responsable_user_id?: string | null
          resumen?: Json | null
          ronda: number
          started_at?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          carga_id?: string
          closed_at?: string | null
          created_at?: string
          estado?: string
          id?: string
          notas?: string | null
          responsable_nombre?: string | null
          responsable_user_id?: string | null
          resumen?: Json | null
          ronda?: number
          started_at?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_chequeos_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "vehiculo_cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_question_templates: {
        Row: {
          created_at: string
          created_by: string | null
          descripcion: string | null
          id: string
          nombre: string
          preguntas: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          preguntas?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          preguntas?: Json
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_check_extras: {
        Row: {
          alumno_id: string | null
          created_at: string
          id: string
          motivo: string | null
          nombre: string
          nota: string | null
          reasignado_at: string | null
          reasignar_a_grupo: string | null
          run_id: string
          telefono: string | null
        }
        Insert: {
          alumno_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          nombre: string
          nota?: string | null
          reasignado_at?: string | null
          reasignar_a_grupo?: string | null
          run_id: string
          telefono?: string | null
        }
        Update: {
          alumno_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          nombre?: string
          nota?: string | null
          reasignado_at?: string | null
          reasignar_a_grupo?: string | null
          run_id?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_check_extras_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_check_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_check_items: {
        Row: {
          alumno_id: string
          checked_at: string | null
          created_at: string
          grupo_incorrecto: boolean
          grupo_real_sugerido: string | null
          id: string
          nombre_snapshot: string
          nota: string | null
          plan_inconsistente: boolean
          resultado: string
          run_id: string
        }
        Insert: {
          alumno_id: string
          checked_at?: string | null
          created_at?: string
          grupo_incorrecto?: boolean
          grupo_real_sugerido?: string | null
          id?: string
          nombre_snapshot: string
          nota?: string | null
          plan_inconsistente?: boolean
          resultado?: string
          run_id: string
        }
        Update: {
          alumno_id?: string
          checked_at?: string | null
          created_at?: string
          grupo_incorrecto?: boolean
          grupo_real_sugerido?: string | null
          id?: string
          nombre_snapshot?: string
          nota?: string | null
          plan_inconsistente?: boolean
          resultado?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_check_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_check_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_check_runs: {
        Row: {
          admin_id: string | null
          cerrado_at: string | null
          cerrado_por: string | null
          coaches_participantes: string[]
          confirmados: number
          created_at: string
          desconocidos_en_grupo: number
          estado: string
          faltantes: number
          fecha_objetivo: string
          grupo: string
          grupo_mal_asignado: number
          id: string
          notas: string | null
          notas_cierre: string | null
          plan_revision: number
          plan_vencido_en_grupo: number
          saltados: number
          total_esperados: number
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          cerrado_at?: string | null
          cerrado_por?: string | null
          coaches_participantes?: string[]
          confirmados?: number
          created_at?: string
          desconocidos_en_grupo?: number
          estado?: string
          faltantes?: number
          fecha_objetivo: string
          grupo: string
          grupo_mal_asignado?: number
          id?: string
          notas?: string | null
          notas_cierre?: string | null
          plan_revision?: number
          plan_vencido_en_grupo?: number
          saltados?: number
          total_esperados?: number
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          cerrado_at?: string | null
          cerrado_por?: string | null
          coaches_participantes?: string[]
          confirmados?: number
          created_at?: string
          desconocidos_en_grupo?: number
          estado?: string
          faltantes?: number
          fecha_objetivo?: string
          grupo?: string
          grupo_mal_asignado?: number
          id?: string
          notas?: string | null
          notas_cierre?: string | null
          plan_revision?: number
          plan_vencido_en_grupo?: number
          saltados?: number
          total_esperados?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      coaches_public: {
        Row: {
          estado: string | null
          grupos: Database["public"]["Enums"]["grupo_ciclismo"][] | null
          id: string | null
          nombre: string | null
          sede_id: string | null
        }
        Insert: {
          estado?: string | null
          grupos?: Database["public"]["Enums"]["grupo_ciclismo"][] | null
          id?: string | null
          nombre?: string | null
          sede_id?: string | null
        }
        Update: {
          estado?: string | null
          grupos?: Database["public"]["Enums"]["grupo_ciclismo"][] | null
          id?: string | null
          nombre?: string | null
          sede_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      emisor_facturado_anual: {
        Row: {
          cuit: string | null
          cupo_disponible: number | null
          emisor_id: string | null
          facturado_anual: number | null
          limite_anual_ars: number | null
          nombre_fiscal: string | null
          porcentaje_uso: number | null
        }
        Relationships: []
      }
      event_participants_ranking: {
        Row: {
          event_id: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          position: number | null
          results_updated_at: string | null
          status: string | null
          team_name: string | null
          time_value: number | null
        }
        Insert: {
          event_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          position?: number | null
          results_updated_at?: string | null
          status?: string | null
          team_name?: string | null
          time_value?: number | null
        }
        Update: {
          event_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          position?: number | null
          results_updated_at?: string | null
          status?: string | null
          team_name?: string | null
          time_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_backfill_candidatos: {
        Row: {
          candidatos_del_pago: number | null
          criterio_match: string | null
          mejor_prioridad_del_pago: number | null
          meta: Json | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
          prioridad: number | null
        }
        Relationships: []
      }
      mv_backfill_ingresos: {
        Row: {
          alumno_id: string | null
          evidencia: Json | null
          fecha_pago: string | null
          moneda_pago: string | null
          monto_pago: number | null
          mp_payment_id: string | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
        }
        Relationships: []
      }
      mv_backfill_obligaciones: {
        Row: {
          alumno_id: string | null
          evidencia: Json | null
          fecha_obligacion: string | null
          moneda: string | null
          monto_obligacion: number | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pagado_legacy: number | null
          periodo: string | null
          saldo_legacy: number | null
        }
        Relationships: []
      }
      mv_backfill_preview: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          capacidad_obligacion: number | null
          criterio_match: string | null
          fecha_pago: string | null
          metadata: Json | null
          moneda_pago: string | null
          monto_obligacion: number | null
          monto_pago: number | null
          monto_propuesto_imputar: number | null
          motivo_revision: string | null
          mp_payment_id: string | null
          nivel_confianza: string | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pagado_legacy: number | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
          periodo_obligacion: string | null
          requiere_revision: boolean | null
          saldo_legacy: number | null
          saldo_obligacion_antes: number | null
          saldo_obligacion_despues: number | null
          saldo_pago_antes: number | null
          saldo_pago_despues: number | null
        }
        Relationships: []
      }
      planes_con_inscriptos: {
        Row: {
          acceso_beneficios: boolean | null
          acceso_entrenamientos: boolean | null
          acceso_eventos: boolean | null
          acceso_whatsapp: boolean | null
          activo: boolean | null
          categoria: string | null
          clases_incluidas: number | null
          clases_por_semana: number | null
          cohort_slug: string | null
          created_at: string | null
          cuota_valor: number | null
          cuotas_cantidad: number | null
          descripcion: string | null
          descripcion_corta: string | null
          es_programa_cerrado: boolean | null
          features: Json | null
          fecha_cierre_inscripcion: string | null
          fecha_fin_programa: string | null
          fecha_inicio_programa: string | null
          frecuencia: string | null
          id: string | null
          imagen_url: string | null
          inscripciones_actuales: number | null
          inscriptos_reales: number | null
          landing_public: boolean | null
          max_inscripciones: number | null
          moneda: string | null
          nombre: string | null
          permite_auto_cobro: boolean | null
          precio: number | null
          precio_promocional: number | null
          renovacion_auto_permitida: boolean | null
          tipo: string | null
          tipo_consumo: string | null
          updated_at: string | null
          vigencia_dias: number | null
          visibilidad: string | null
          whatsapp_url: string | null
        }
        Insert: {
          acceso_beneficios?: boolean | null
          acceso_entrenamientos?: boolean | null
          acceso_eventos?: boolean | null
          acceso_whatsapp?: boolean | null
          activo?: boolean | null
          categoria?: string | null
          clases_incluidas?: number | null
          clases_por_semana?: number | null
          cohort_slug?: string | null
          created_at?: string | null
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          es_programa_cerrado?: boolean | null
          features?: Json | null
          fecha_cierre_inscripcion?: string | null
          fecha_fin_programa?: string | null
          fecha_inicio_programa?: string | null
          frecuencia?: string | null
          id?: string | null
          imagen_url?: string | null
          inscripciones_actuales?: number | null
          inscriptos_reales?: never
          landing_public?: boolean | null
          max_inscripciones?: number | null
          moneda?: string | null
          nombre?: string | null
          permite_auto_cobro?: boolean | null
          precio?: number | null
          precio_promocional?: number | null
          renovacion_auto_permitida?: boolean | null
          tipo?: string | null
          tipo_consumo?: string | null
          updated_at?: string | null
          vigencia_dias?: number | null
          visibilidad?: string | null
          whatsapp_url?: string | null
        }
        Update: {
          acceso_beneficios?: boolean | null
          acceso_entrenamientos?: boolean | null
          acceso_eventos?: boolean | null
          acceso_whatsapp?: boolean | null
          activo?: boolean | null
          categoria?: string | null
          clases_incluidas?: number | null
          clases_por_semana?: number | null
          cohort_slug?: string | null
          created_at?: string | null
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          es_programa_cerrado?: boolean | null
          features?: Json | null
          fecha_cierre_inscripcion?: string | null
          fecha_fin_programa?: string | null
          fecha_inicio_programa?: string | null
          frecuencia?: string | null
          id?: string | null
          imagen_url?: string | null
          inscripciones_actuales?: number | null
          inscriptos_reales?: never
          landing_public?: boolean | null
          max_inscripciones?: number | null
          moneda?: string | null
          nombre?: string | null
          permite_auto_cobro?: boolean | null
          precio?: number | null
          precio_promocional?: number | null
          renovacion_auto_permitida?: boolean | null
          tipo?: string | null
          tipo_consumo?: string | null
          updated_at?: string | null
          vigencia_dias?: number | null
          visibilidad?: string | null
          whatsapp_url?: string | null
        }
        Relationships: []
      }
      v_ingresos_netos: {
        Row: {
          alumno_id: string | null
          bruto: number | null
          comision_total: number | null
          estado: string | null
          event_id: string | null
          fecha: string | null
          fees_synced_at: string | null
          metodo: string | null
          moneda: string | null
          mp_payment_id: string | null
          neto: number | null
          origen: string | null
          ref_padre_id: string | null
          referencia_id: string | null
        }
        Relationships: []
      }
      v_reservation_account: {
        Row: {
          alumno_id: string | null
          amount_paid: number | null
          amount_total: number | null
          balance_due: number | null
          credito_disponible: number | null
          debitos_pendientes: number | null
          event_id: string | null
          moneda: string | null
          reembolsado: number | null
          reservation_id: string | null
        }
        Insert: {
          alumno_id?: string | null
          amount_paid?: number | null
          amount_total?: number | null
          balance_due?: number | null
          credito_disponible?: never
          debitos_pendientes?: never
          event_id?: string | null
          moneda?: string | null
          reembolsado?: never
          reservation_id?: string | null
        }
        Update: {
          alumno_id?: string | null
          amount_paid?: number | null
          amount_total?: number | null
          balance_due?: number | null
          credito_disponible?: never
          debitos_pendientes?: never
          event_id?: string | null
          moneda?: string | null
          reembolsado?: never
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reservations_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reservations_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "event_reservations_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "event_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_backfill_candidatos: {
        Row: {
          candidatos_del_pago: number | null
          criterio_match: string | null
          mejor_prioridad_del_pago: number | null
          meta: Json | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
          prioridad: number | null
        }
        Relationships: []
      }
      vw_backfill_identidad_sugerida: {
        Row: {
          alumno_sugerido: string | null
          alumno_sugerido_id: string | null
          confianza_identidad: string | null
          evidencia: Json | null
          fecha_pago: string | null
          moneda_pago: string | null
          monto_pago: number | null
          mp_payment_id: string | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
        }
        Relationships: []
      }
      vw_backfill_ingresos: {
        Row: {
          alumno_id: string | null
          evidencia: Json | null
          fecha_pago: string | null
          moneda_pago: string | null
          monto_pago: number | null
          mp_payment_id: string | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
        }
        Relationships: []
      }
      vw_backfill_obligaciones: {
        Row: {
          alumno_id: string | null
          evidencia: Json | null
          fecha_obligacion: string | null
          moneda: string | null
          monto_obligacion: number | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pagado_legacy: number | null
          periodo: string | null
        }
        Relationships: []
      }
      vw_backfill_resumen: {
        Row: {
          alumnos: number | null
          imputaciones_propuestas: number | null
          monto_propuesto: number | null
          nivel_confianza: string | null
          pagos: number | null
        }
        Relationships: []
      }
      vw_backfill_saldos_comparacion: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          cargos_legacy: number | null
          clasificacion_diferencia: string | null
          creditos_legacy: number | null
          diferencia: number | null
          imputaciones_simuladas: number | null
          obligaciones_modelo_nuevo: number | null
          pagos_legacy: number | null
          saldo_disponible_pagos: number | null
          saldo_legacy: number | null
          saldo_modelo_nuevo_simulado: number | null
        }
        Relationships: []
      }
      vw_backfill_sobreimputacion: {
        Row: {
          entidad_id: string | null
          entidad_tipo: string | null
          exceso: number | null
          propuesto: number | null
          severidad: string | null
          tipo: string | null
          tope: number | null
        }
        Relationships: []
      }
      vw_bajas_metricas_mensuales: {
        Row: {
          antiguedad_promedio_dias: number | null
          canceladas_por_alumno: number | null
          con_auto_renovacion: number | null
          con_deuda: number | null
          confirmadas: number | null
          evitadas: number | null
          mes: string | null
          pendientes: number | null
          por_motivo: Json | null
          solicitadas: number | null
        }
        Relationships: []
      }
      vw_conciliacion_pagos: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          descripcion: string | null
          estado_conciliacion: string | null
          estado_origen: string | null
          fecha: string | null
          fuente: string | null
          metodo_pago: string | null
          moneda: string | null
          monto: number | null
          mp_payment_id: string | null
          origen: string | null
          registro_id: string | null
          verificado: boolean | null
          verificado_at: string | null
          verificado_by: string | null
        }
        Relationships: []
      }
      vw_cuenta_corriente_movimientos: {
        Row: {
          alumno_id: string | null
          concepto: string | null
          debe: number | null
          estado: string | null
          fecha: string | null
          fuente_id: string | null
          fuente_tabla: string | null
          haber: number | null
          moneda: string | null
          referencia_extra: Json | null
          tipo: string | null
        }
        Relationships: []
      }
      vw_inconsistencias_early_renewal: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          descripcion: string | null
          diferencia: number | null
          fecha: string | null
          metadata: Json | null
          moneda: string | null
          monto_obligacion: number | null
          monto_pago: number | null
          mp_payment_id: string | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pagado: number | null
          pago_id: string | null
          pago_origen: string | null
          saldo: number | null
          severidad: string | null
          tipo: string | null
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
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      vw_obligaciones_modelo_nuevo: {
        Row: {
          alumno_id: string | null
          imputado: number | null
          moneda: string | null
          monto: number | null
          obligacion_id: string | null
          obligacion_tipo: string | null
        }
        Relationships: []
      }
      vw_pagos_disponibles: {
        Row: {
          alumno_id: string | null
          concepto: string | null
          consumido_legacy: boolean | null
          disponible: number | null
          fecha: string | null
          moneda: string | null
          monto_bruto: number | null
          monto_imputado: number | null
          mp_payment_id: string | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
        }
        Insert: {
          alumno_id?: string | null
          concepto?: never
          consumido_legacy?: never
          disponible?: never
          fecha?: string | null
          moneda?: string | null
          monto_bruto?: number | null
          monto_imputado?: never
          mp_payment_id?: string | null
          pago_origen_id?: string | null
          pago_origen_tipo?: never
        }
        Update: {
          alumno_id?: string | null
          concepto?: never
          consumido_legacy?: never
          disponible?: never
          fecha?: string | null
          moneda?: string | null
          monto_bruto?: number | null
          monto_imputado?: never
          mp_payment_id?: string | null
          pago_origen_id?: string | null
          pago_origen_tipo?: never
        }
        Relationships: [
          {
            foreignKeyName: "mp_account_movements_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mp_account_movements_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "mp_account_movements_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
        ]
      }
      vw_pagos_imputaciones_backfill_preview: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          capacidad_obligacion: number | null
          criterio_match: string | null
          fecha_pago: string | null
          metadata: Json | null
          moneda_pago: string | null
          monto_obligacion: number | null
          monto_pago: number | null
          monto_propuesto_imputar: number | null
          motivo_revision: string | null
          mp_payment_id: string | null
          nivel_confianza: string | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pagado_legacy: number | null
          pago_origen_id: string | null
          pago_origen_tipo: string | null
          periodo_obligacion: string | null
          requiere_revision: boolean | null
          saldo_legacy: number | null
          saldo_obligacion_antes: number | null
          saldo_obligacion_despues: number | null
          saldo_pago_antes: number | null
          saldo_pago_despues: number | null
        }
        Relationships: []
      }
      vw_pagos_inconsistencias: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          descripcion: string | null
          diferencia: number | null
          fecha: string | null
          metadata: Json | null
          moneda: string | null
          monto_obligacion: number | null
          monto_pago: number | null
          mp_payment_id: string | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pagado: number | null
          pago_id: string | null
          pago_origen: string | null
          saldo: number | null
          severidad: string | null
          tipo: string | null
        }
        Relationships: []
      }
      vw_pagos_por_cobrar: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          alumno_telefono: string | null
          amount: number | null
          concepto: string | null
          created_at: string | null
          currency: string | null
          due_date: string | null
          effective_status: string | null
          item_id: string | null
          source: string | null
        }
        Relationships: []
      }
      vw_programa_posibles_duplicados: {
        Row: {
          alumno_1_email: string | null
          alumno_1_id: string | null
          alumno_1_nombre: string | null
          alumno_2_email: string | null
          alumno_2_id: string | null
          alumno_2_nombre: string | null
          estado_1: string | null
          estado_2: string | null
          motivo_match: string | null
          nivel_confianza: string | null
          plan_id: string | null
          plan_nombre: string | null
          suscripcion_1_id: string | null
          suscripcion_2_id: string | null
          telefono_normalizado: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_1_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_2_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_1_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_2_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_identidad_sugerida"
            referencedColumns: ["alumno_sugerido_id"]
          },
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_1_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "suscripciones_alumno_id_fkey"
            columns: ["alumno_2_id"]
            isOneToOne: false
            referencedRelation: "vw_backfill_saldos_comparacion"
            referencedColumns: ["alumno_id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes_con_inscriptos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_saldo_comparacion: {
        Row: {
          alumno_id: string | null
          alumno_nombre: string | null
          cargos_legacy: number | null
          cargos_nuevo: number | null
          diferencia: number | null
          imputado_nuevo: number | null
          moneda: string | null
          pagos_legacy: number | null
          saldo_legacy: number | null
          saldo_nuevo: number | null
        }
        Relationships: []
      }
      vw_saldo_imputaciones: {
        Row: {
          alumno_id: string | null
          cargos_nuevo: number | null
          imputado_nuevo: number | null
          moneda: string | null
          saldo_nuevo: number | null
        }
        Relationships: []
      }
      vw_saldo_legacy: {
        Row: {
          alumno_id: string | null
          cargos_legacy: number | null
          moneda: string | null
          pagos_legacy: number | null
          saldo_legacy: number | null
        }
        Relationships: []
      }
      vw_stock_inconsistencias: {
        Row: {
          detalle: string | null
          order_id: string | null
          order_number: number | null
          product_id: string | null
          severidad: string | null
          tipo: string | null
          variante: string | null
        }
        Relationships: []
      }
      vw_turnera_sede_backfill: {
        Row: {
          apellido: string | null
          clasificacion: string | null
          coach_id: string | null
          estado_operativo: string | null
          fecha: string | null
          hora_inicio: string | null
          id: string | null
          n_sedes: number | null
          nombre: string | null
          sede_sugerida: string | null
          servicio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_turnera_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_turnera_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_turnera_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_turnera"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _adjust_product_stock: {
        Args: {
          p_cambio_id: string
          p_delta: number
          p_metodo: Database["public"]["Enums"]["cambio_metodo"]
          p_motivo: string
          p_order_id: string
          p_product_id: string
          p_user_id: string
          p_variante: Json
        }
        Returns: undefined
      }
      _adjust_stock_by_key: {
        Args: {
          p_delta: number
          p_key: string
          p_motivo: string
          p_order_id: string
          p_product_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      _build_variant_key: {
        Args: { p_product_id: string; p_variante: Json }
        Returns: string
      }
      _cancel_store_order_core: {
        Args: { p_order_id: string; p_reason: string; p_user_id: string }
        Returns: Json
      }
      _delivery_variant_norm: { Args: { v: string }; Returns: string }
      _programa_admin_ok: { Args: never; Returns: boolean }
      _supplier_variant_norm: { Args: { v: Json }; Returns: string }
      accept_roommate_invitation: {
        Args: { _roommate_id: string }
        Returns: Json
      }
      adjust_ejec_previsto_range:
        | {
            Args: {
              p_mes_desde: string
              p_mes_hasta: string
              p_motivo?: string
              p_nuevo_previsto: number
              p_rec_id: string
            }
            Returns: number
          }
        | {
            Args: {
              p_mes_desde: string
              p_mes_hasta: string
              p_motivo?: string
              p_nuevo_previsto: number
              p_rec_id: string
              p_sync_catalogo?: boolean
            }
            Returns: number
          }
      adjust_store_stock: {
        Args: {
          p_cambio_id?: string
          p_delta: number
          p_key: string
          p_metodo?: Database["public"]["Enums"]["cambio_metodo"]
          p_motivo: string
          p_order_id?: string
          p_order_item_id?: string
          p_product_id: string
          p_reversa_de?: string
          p_strict?: boolean
          p_user_id?: string
        }
        Returns: string
      }
      admin_create_cambio_indumentaria: {
        Args: {
          p_alumno_id: string
          p_comentario: string
          p_compra_id: string
          p_motivo: Database["public"]["Enums"]["cambio_motivo"]
          p_motivo_admin: string
          p_origen_tipo: string
          p_preorder_id: string
          p_producto_id: string
          p_variante_destino: Json
          p_variante_origen: Json
        }
        Returns: string
      }
      admin_create_cuenta_token: {
        Args: { p_alumno_id: string; p_expires_days?: number }
        Returns: {
          expires_at: string
          id: string
          token: string
        }[]
      }
      admin_create_event_reservation: {
        Args: {
          p_alumno_id?: string
          p_event_id: string
          p_external?: Json
          p_note?: string
          p_package_id?: string
        }
        Returns: Json
      }
      admin_get_or_create_cuenta_token: {
        Args: { p_alumno_id: string }
        Returns: {
          access_count: number
          created_at: string
          id: string
          last_accessed_at: string
          last_ip: string
          last_user_agent: string
          revoked_at: string
          token: string
        }[]
      }
      admin_revoke_cuenta_token: {
        Args: { p_token_id: string }
        Returns: undefined
      }
      admin_set_reservation_price_snapshot: {
        Args: { p_note?: string; p_price?: number; p_reservation_id: string }
        Returns: Json
      }
      admin_update_turnera_reservation: {
        Args: {
          p_coach_id: string
          p_fecha: string
          p_hora_fin: string
          p_hora_inicio: string
          p_motivo: string
          p_nota: string
          p_reservation_id: string
          p_sede_id: string
        }
        Returns: Json
      }
      announce_cash_payment: {
        Args: {
          _fecha_limite: string
          _lugar: string
          _nota: string
          _reservation_id: string
        }
        Returns: Json
      }
      anular_imputacion: {
        Args: { _id: string; _motivo?: string }
        Returns: boolean
      }
      aplicar_saldo_disponible: {
        Args: {
          _monto: number
          _obligacion_id: string
          _obligacion_tipo: string
          _pago_origen_id: string
          _pago_origen_tipo: string
        }
        Returns: Json
      }
      apply_credit_ajuste_to_suscripcion: {
        Args: { _ajuste_id: string; _suscripcion_id: string }
        Returns: Json
      }
      apply_credit_ajuste_to_target: {
        Args: { _ajuste_id: string; _target_id: string; _target_type: string }
        Returns: Json
      }
      apply_mp_payment_to_gasto: {
        Args: {
          p_external_reference: string
          p_fecha: string
          p_gasto_id: string
          p_monto: number
          p_mp_payment_id: string
          p_mp_status: string
        }
        Returns: undefined
      }
      apply_package_change: {
        Args: {
          p_admin_note?: string
          p_override_plaza_libre?: boolean
          p_package_nuevo_id: string
          p_price_override?: number
          p_request_id?: string
          p_reservation_id: string
          p_revalidation_token: string
        }
        Returns: Json
      }
      apply_pending_price_changes: { Args: never; Returns: number }
      apply_price_change_to_subscriptions: {
        Args: { _historial_id: string }
        Returns: number
      }
      apply_stock_count_adjustments:
        | { Args: { p_items: Json }; Returns: Json }
        | {
            Args: {
              p_categoria?: string
              p_items: Json
              p_observaciones?: string
              p_reporte?: string
            }
            Returns: Json
          }
      apply_stock_count_product: {
        Args: { p_count_id: string; p_items: Json }
        Returns: Json
      }
      apply_supplier_shortage_to_delivery: {
        Args: { _list_id: string; _order_id: string }
        Returns: {
          items_borrados: number
          items_reducidos: number
          producto: string
          removido: number
          variante: string
        }[]
      }
      assign_mp_movement_to_alumno: {
        Args: { _alumno_id: string; _movement_id: string; _notes?: string }
        Returns: Json
      }
      assign_mp_movement_to_new_suscripcion: {
        Args: {
          _alumno_id: string
          _fecha_inicio?: string
          _movement_id: string
          _notes?: string
          _plan_id: string
          _precio?: number
        }
        Returns: Json
      }
      assign_mp_movement_to_target: {
        Args: {
          _alumno_id: string
          _movement_id: string
          _notes?: string
          _target_id?: string
          _target_type: string
        }
        Returns: Json
      }
      audit_alumno_precios: {
        Args: { _alumno_id: string }
        Returns: {
          aplicado_antes_de_vigencia: boolean
          desalineada: boolean
          diagnostico: string
          diferencia: number
          estado: string
          fecha_fin: string
          fecha_inicio: string
          moneda: string
          origen_aplicado_at: string
          origen_aplicar_a: string
          origen_fecha_cambio: string
          origen_fecha_vigencia: string
          origen_historial_id: string
          origen_modificado_por: string
          plan_id: string
          plan_nombre: string
          precio_base: number
          precio_esperado: number
          precio_final: number
          precio_plan_actual: number
          reproceso_fuera_de_orden: boolean
          sub_updated_at: string
          suscripcion_id: string
          ultimo_job_aplicado_at: string
          ultimo_job_vigencia: string
        }[]
      }
      auto_resolve_tareas_automaticas: { Args: never; Returns: number }
      backfill_turnera_sede: { Args: { p_dry_run?: boolean }; Returns: Json }
      build_baja_snapshot: { Args: { p_alumno_id: string }; Returns: Json }
      build_payment_plan_snapshot: {
        Args: {
          p_fecha_reserva?: string
          p_plan_id: string
          p_precio_final: number
        }
        Returns: Json
      }
      cambiar_plan_suscripcion: {
        Args: {
          _excepcion_motivo?: string
          _motivo: string
          _nuevo_plan_id: string
          _precio_excepcion?: number
          _suscripcion_id: string
          _usar_precio_del_nuevo_plan?: boolean
        }
        Returns: Json
      }
      cancel_store_order:
        | { Args: { _order_id: string; _reason: string }; Returns: Json }
        | { Args: { p_order_id: string }; Returns: Json }
      cancelar_solicitud_baja: {
        Args: { p_solicitud_id: string }
        Returns: undefined
      }
      cerrar_vehiculo_carga: { Args: { _carga_id: string }; Returns: undefined }
      check_admin_or_coach_email: { Args: { _email: string }; Returns: boolean }
      check_programa_enrollment: {
        Args: { _alumno_id: string; _plan_id: string }
        Returns: Json
      }
      classify_package_change: {
        Args: {
          p_package_nuevo_id: string
          p_reservation_id: string
          p_room_impact: Json
        }
        Returns: string
      }
      close_delivery_cash: {
        Args: { p_list_id: string; p_notas?: string }
        Returns: undefined
      }
      close_vehiculo_chequeo: {
        Args: { _chequeo_id: string; _notas?: string }
        Returns: Json
      }
      condone_installment: {
        Args: { p_amount: number; p_installment_id: string; p_reason: string }
        Returns: undefined
      }
      confirm_alumno_email_link: {
        Args: { p_token: string }
        Returns: {
          email_principal: string
          email_vinculado: string
          mensaje: string
          nombre_completo: string
          ok: boolean
        }[]
      }
      confirm_baja_alumno: {
        Args: {
          p_email_notificar?: boolean
          p_notas?: string
          p_solicitud_id: string
        }
        Returns: {
          alumno_id: string
          mp_preapproval_ids: string[]
        }[]
      }
      confirm_reservation: { Args: { _reservation_id: string }; Returns: Json }
      confirm_waitlist_request: {
        Args: {
          p_new_room_capacidad: number
          p_new_room_genero: string
          p_new_room_nombre: string
          p_new_room_tipo: string
          p_nota_admin: string
          p_request_id: string
          p_room_id: string
        }
        Returns: Json
      }
      consume_survey_token: { Args: { _token: string }; Returns: boolean }
      consumir_clase_bono: {
        Args: {
          p_coach_id?: string
          p_fecha?: string
          p_notas?: string
          p_suscripcion_id: string
        }
        Returns: string
      }
      count_admin_novedades: { Args: never; Returns: Json }
      count_new_turnera_reservations: { Args: never; Returns: number }
      count_new_waitlist_entries: { Args: never; Returns: number }
      count_pending_waitlist_requests: { Args: never; Returns: number }
      crear_suscripcion_para_imputar: {
        Args: {
          _alumno_id: string
          _fecha_inicio: string
          _plan_id: string
          _precio?: number
        }
        Returns: string
      }
      create_gasto_from_mp: {
        Args: {
          p_descripcion: string
          p_fecha: string
          p_moneda: string
          p_monto: number
          p_mp_payment_id: string
          p_mp_status: string
          p_proveedor: string
        }
        Returns: string
      }
      create_supplier_order_from_sales: {
        Args: {
          p_fecha_estimada_entrega: string
          p_groups: Json
          p_moneda: string
          p_notas: string
          p_proveedor_email: string
          p_proveedor_nombre: string
          p_supplier_id: string
        }
        Returns: {
          numero: string
          order_id: string
        }[]
      }
      create_turnera_reservation: {
        Args: {
          p_acepto_politica: boolean
          p_alumno_id?: string
          p_apellido: string
          p_celular: string
          p_coach_id: string
          p_documento: string
          p_email: string
          p_fecha: string
          p_fecha_nacimiento: string
          p_form_responses?: Json
          p_hora_fin: string
          p_hora_inicio: string
          p_nombre: string
          p_nota: string
          p_origen_link: string
          p_reservation_id: string
          p_sede_id: string
          p_servicio_id: string
        }
        Returns: string
      }
      cuenta_publica_consume_credit: {
        Args: { p_fuente_id: string; p_fuente_tabla: string; p_token: string }
        Returns: Json
      }
      dar_baja_directa: {
        Args: {
          p_alumno_id: string
          p_comentario?: string
          p_email_notificar?: boolean
          p_motivo: string
          p_motivo_otro_detalle?: string
          p_notas?: string
        }
        Returns: {
          alumno_id: string
          mp_preapproval_ids: string[]
          solicitud_id: string
        }[]
      }
      dar_de_baja_programa: {
        Args: {
          _motivo: string
          _suscripcion_id: string
          _tratamiento_pago?: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_gasto_deuda_mov: { Args: { p_id: string }; Returns: undefined }
      delete_gasto_pago: { Args: { p_pago_id: string }; Returns: undefined }
      delivery_add_payment_by_token: {
        Args: {
          p_cargado_por_nombre?: string
          p_cliente_nombre: string
          p_comprobante_path?: string
          p_forma_pago: string
          p_moneda: string
          p_monto: number
          p_notas?: string
          p_token: string
        }
        Returns: string
      }
      delivery_get_by_token: { Args: { _token: string }; Returns: Json }
      delivery_list_accepts_uploads: {
        Args: { _list_id: string }
        Returns: boolean
      }
      delivery_list_summary_row: {
        Args: { p_list_id: string }
        Returns: {
          caja_estado: string
          cobros_sin_validar: number
          costo_desde_items: boolean
          costo_total_mercaderia: number
          costo_total_nativo: number
          esperado_cobrar: number
          esperado_cobrar_nativo: number
          items_entregados: number
          items_pendientes: number
          items_total: number
          list_id: string
          margen_bruto: number
          moneda_items: string
          otras_salidas: number
          pagado_a_proveedor: number
          saldo_a_proveedor: number
          salidas_totales: number
          tc_usd: number
          titulo: string
          total_cobrado: number
          total_cobrado_validado: number
          total_pendiente: number
        }[]
      }
      delivery_toggle_item_by_token: {
        Args: { _item_id: string; _preparado: boolean; _token: string }
        Returns: boolean
      }
      deposito_definir_reemplazo: {
        Args: {
          p_cambio_id: string
          p_marcar_listo: boolean
          p_metodo: Database["public"]["Enums"]["cambio_metodo"]
          p_producto_id: string
          p_variante: Json
        }
        Returns: undefined
      }
      deposito_recibir_cambio: {
        Args: {
          p_cambio_id: string
          p_entregar_reemplazo: boolean
          p_metodo: Database["public"]["Enums"]["cambio_metodo"]
          p_qr_devuelto_pid: string
          p_qr_devuelto_variante: Json
          p_qr_recibido_pid: string
          p_qr_recibido_variante: Json
        }
        Returns: undefined
      }
      deposito_registrar_cambio_presencial: {
        Args: {
          p_alumno_id: string
          p_comentario: string
          p_entregar_reemplazo: boolean
          p_metodo: Database["public"]["Enums"]["cambio_metodo"]
          p_motivo: Database["public"]["Enums"]["cambio_motivo"]
          p_order_id: string
          p_qr_devuelto_pid: string
          p_qr_devuelto_variante: Json
          p_qr_recibido_pid: string
          p_qr_recibido_variante: Json
        }
        Returns: string
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      evaluate_room_impact: {
        Args: {
          p_package_nuevo_id: string
          p_reservation_id: string
          p_roommate_propuesto_id?: string
        }
        Returns: Json
      }
      expire_descuentos_alumno: { Args: never; Returns: number }
      expire_overdue_pausas: {
        Args: never
        Returns: {
          alumno_email: string
          alumno_id: string
          alumno_nombre: string
          fecha_fin: string
          suscripcion_id: string
        }[]
      }
      expire_stale_subscriptions_for_alumno: {
        Args: { p_alumno_id: string; p_plan_id?: string }
        Returns: number
      }
      finalize_stock_count:
        | {
            Args: {
              p_count_id: string
              p_observaciones?: string
              p_reporte?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_count_id: string
              p_observaciones?: string
              p_reporte?: string
              p_zero_uncounted?: boolean
            }
            Returns: Json
          }
      finalize_supplier_order_entry: {
        Args: { _order_id: string }
        Returns: Json
      }
      find_alumno_for_turnera: {
        Args: { p_documento: string; p_email: string }
        Returns: {
          alumno_id: string
          apellido_inicial: string
          celular: string
          documento: string
          email: string
          fecha_nacimiento: string
          nombre: string
        }[]
      }
      fn_imputar_credito_a_suscripcion: {
        Args: { _ajuste_id: string; _suscripcion_id: string }
        Returns: undefined
      }
      fn_mp_pago_ya_registrado: {
        Args: { _alumno_id: string; _mp_payment_id: string }
        Returns: boolean
      }
      generate_gastos_ejecuciones_month: {
        Args: { p_mes: string }
        Returns: number
      }
      generate_tareas_automaticas: { Args: never; Returns: number }
      generate_tareas_gastos_pendientes: { Args: never; Returns: number }
      get_active_price_stage: {
        Args: { _at?: string; _package_id: string }
        Returns: {
          activo: boolean
          created_at: string
          currency: string
          id: string
          incremento_pct: number | null
          nombre: string
          package_id: string
          precio: number
          sort_order: number
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        SetofOptions: {
          from: "*"
          to: "event_package_price_stages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_admin_notification_emails_masked: { Args: never; Returns: Json }
      get_all_gastos_saldo_deuda: {
        Args: never
        Returns: {
          moneda: string
          recurrente_id: string
          saldo_total: number
        }[]
      }
      get_alumno_payment_targets: {
        Args: { _alumno_id: string }
        Returns: Json
      }
      get_billing_dashboard: { Args: never; Returns: Json }
      get_coaches_public: {
        Args: never
        Returns: {
          estado: string
          grupos: string[]
          id: string
          nombre: string
          sede_id: string
        }[]
      }
      get_combo_available_stock: {
        Args: { p_combo_id: string; p_selection?: Json }
        Returns: number
      }
      get_conciliacion_del_dia: {
        Args: { p_fecha: string }
        Returns: {
          egresos_app_count: number
          egresos_app_total: number
          egresos_banco_count: number
          egresos_banco_total: number
          huerfanos_count: number
          huerfanos_total: number
          mp_app_count: number
          mp_app_total: number
          mp_banco_count: number
          mp_banco_total: number
          transfer_app_count: number
          transfer_app_total: number
        }[]
      }
      get_conciliacion_por_cuenta_del_dia: {
        Args: { p_fecha: string }
        Returns: {
          cuenta_id: string
          cuenta_nombre: string
          diferencia: number
          egresos_app_count: number
          egresos_app_total: number
          egresos_banco_count: number
          egresos_banco_total: number
          mp_app_count: number
          mp_app_total: number
          mp_banco_count: number
          mp_banco_total: number
        }[]
      }
      get_cuenta_publica: {
        Args: { p_ip?: string; p_token: string; p_user_agent?: string }
        Returns: Json
      }
      get_cuenta_publica_deudas_raw: {
        Args: { p_alumno_id: string }
        Returns: {
          moneda: string
          por_pagar: number
        }[]
      }
      get_deudores_cobranzas: {
        Args: never
        Returns: {
          alumno_id: string
          apellido: string
          concepto: string
          credito_disponible: number
          dias_mora: number
          email: string
          estado_alumno: string
          fecha: string
          fuente_id: string
          fuente_tabla: string
          grupo: string
          moneda: string
          nombre: string
          saldo_item: number
          sede_id: string
          telefono: string
        }[]
      }
      get_disponibilidad_ajustada_publica: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          coach_id: string
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          tipo: string
        }[]
      }
      get_efectivo_del_dia: {
        Args: { p_fecha: string }
        Returns: {
          escuela: number
          escuela_count: number
          tienda: number
          tienda_count: number
          viajes: number
          viajes_count: number
        }[]
      }
      get_efectivo_detalle_del_dia: {
        Args: { p_fecha: string; p_unidad: string }
        Returns: {
          alumno_nombre: string
          descripcion: string
          hora: string
          moneda: string
          monto: number
          ref_id: string
        }[]
      }
      get_event_pnl: {
        Args: { p_event_id: string }
        Returns: {
          comision_mp_total: number
          gastos_directos: number
          honorarios_coaches: number
          ingresos_brutos: number
          ingresos_netos: number
          moneda: string
          pagos_count: number
          pagos_sin_fees: number
          resultado: number
        }[]
      }
      get_event_waitlist_meta: { Args: { p_event_id: string }; Returns: Json }
      get_facturacion_metrics: {
        Args: { _desde?: string }
        Returns: {
          antiguedad_mas_viejo_horas: number
          errores: number
          facturados: number
          monto_pendiente: number
          pendientes: number
          tasa_exito: number
        }[]
      }
      get_gasto_recurrente_saldo_deuda: {
        Args: { p_rec_id: string }
        Returns: {
          ajustes: number
          cargos_manuales: number
          deuda_automatica: number
          moneda: string
          pagos_deuda: number
          recurrente_id: string
          saldo_total: number
        }[]
      }
      get_guest_reservation_by_token: {
        Args: { _token: string }
        Returns: Json
      }
      get_my_reservation: {
        Args: { _external_token?: string; _reservation_id: string }
        Returns: Json
      }
      get_my_reservation_lodging: {
        Args: { _reservation_id: string }
        Returns: {
          package_nombre: string
          room_capacidad: number
          room_genero: string
          room_id: string
          room_nombre: string
          room_tipo: string
          roommates: string[]
        }[]
      }
      get_package_active_price: {
        Args: { p_now?: string; p_package_id: string }
        Returns: {
          currency: string
          precio: number
          stage_id: string
          stage_nombre: string
        }[]
      }
      get_package_availability_breakdown: {
        Args: { p_package_id: string }
        Returns: {
          available: number
          capacity: number
          genero: string
          taken: number
          tipo: string
        }[]
      }
      get_package_available_spots: {
        Args: { p_package_id: string }
        Returns: number
      }
      get_pagos_inconsistencias: {
        Args: never
        Returns: {
          alumno_id: string | null
          alumno_nombre: string | null
          descripcion: string | null
          diferencia: number | null
          fecha: string | null
          metadata: Json | null
          moneda: string | null
          monto_obligacion: number | null
          monto_pago: number | null
          mp_payment_id: string | null
          obligacion_id: string | null
          obligacion_tipo: string | null
          pagado: number | null
          pago_id: string | null
          pago_origen: string | null
          saldo: number | null
          severidad: string | null
          tipo: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "vw_pagos_inconsistencias"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_pending_event_promo: {
        Args: { _alumno_id: string; _evento_id: string }
        Returns: Json
      }
      get_plan_current_price: {
        Args: { _plan_id: string }
        Returns: {
          cuotas_cantidad: number
          fecha_desde: string
          fecha_hasta: string
          precio: number
          precio_cuota: number
          stage_id: string
          stage_nombre: string
        }[]
      }
      get_preorder_reserved_units: {
        Args: { p_product_id: string }
        Returns: number
      }
      get_program_inscriptions_count: {
        Args: { p_plan_ids: string[] }
        Returns: {
          count: number
          plan_id: string
        }[]
      }
      get_promo_code: {
        Args: { _codigo: string; _evento_id: string }
        Returns: Json
      }
      get_prospect_roadbook: { Args: { _token: string }; Returns: Json }
      get_public_program: { Args: { _cohort_slug: string }; Returns: Json }
      get_reingreso_status: { Args: { p_alumno_id: string }; Returns: Json }
      get_reserva_turnera_by_token: {
        Args: { _id: string; _token: string }
        Returns: {
          apellido: string
          comprobante_url: string
          email: string
          fecha: string
          hold_expira_at: string
          hora_fin: string
          hora_inicio: string
          id: string
          metodo_pago: string
          moneda_snapshot: string
          motivo_rechazo: string
          nombre: string
          pago_estado: string
          pago_monto: number
          servicio_id: string
          servicio_nombre: string
          upload_token: string
        }[]
      }
      get_reservas_turnera_ocupadas: {
        Args: { p_desde: string; p_hasta: string; p_servicio_id: string }
        Returns: {
          coach_id: string
          fecha: string
          hora_fin: string
          hora_inicio: string
        }[]
      }
      get_reservation_participant_by_token: {
        Args: { p_token: string }
        Returns: {
          apellido: string
          email: string
          id: string
          nombre: string
        }[]
      }
      get_saldo_alumno: {
        Args: { p_alumno_id: string }
        Returns: {
          moneda: string
          saldo: number
          total_cargos: number
          total_pagos: number
        }[]
      }
      get_saldos_todos_alumnos: {
        Args: never
        Returns: {
          alumno_id: string
          apellido: string
          cantidad_movimientos: number
          email: string
          estado: string
          grupo: string
          moneda: string
          nombre: string
          saldo: number
          sede_id: string
          telefono: string
          total_cargos: number
          total_pagos: number
          ultimo_movimiento: string
        }[]
      }
      get_survey_by_token: {
        Args: { _token: string }
        Returns: {
          activa: boolean
          anonima: boolean
          descripcion: string
          event_id: string
          event_title: string
          id: string
          preguntas: Json
          titulo: string
        }[]
      }
      get_turnera_bank_config: {
        Args: never
        Returns: {
          alias: string
          cbu: string
          cuit: string
          titular: string
        }[]
      }
      get_vehiculo_chequeo_diff: {
        Args: { _chequeo_id: string }
        Returns: {
          cantidad: number
          cliente_nombre: string
          en_base: boolean
          escaneado: boolean
          informado_entregado: boolean
          item_id: string
          producto: string
          resultado: string
          source_table: string
          variante: string
        }[]
      }
      get_waitlist_entries_for_template: {
        Args: { p_template_id: string }
        Returns: {
          created_at: string
          dni: string
          email: string
          entry_id: string
          estado: string
          event_id: string
          event_title: string
          nombre: string
          respuestas: Json
          telefono: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      importe_a_pagar_ahora: {
        Args: { _reservation_id: string }
        Returns: Json
      }
      imputar_pago: {
        Args: {
          _alumno_id: string
          _metadata?: Json
          _moneda?: string
          _monto: number
          _obligacion_id: string
          _obligacion_tipo: string
          _pago_origen_id: string
          _pago_origen_tipo: string
        }
        Returns: string
      }
      impute_validated_payments_to_installments: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      is_metodo_auto_conciliado: {
        Args: { _metodo: string; _mp_payment_id: string }
        Returns: boolean
      }
      is_subscription_paid:
        | { Args: { _sub_id: string }; Returns: boolean }
        | {
            Args: {
              _chequeado_admin: boolean
              _metodo_pago: string
              _mp_payment_id: string
              _mp_status: string
              _origen_registro: string
              _sub_id: string
            }
            Returns: boolean
          }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_event_participants_for_roommate: {
        Args: { _event_id: string }
        Returns: {
          alumno_id: string
          email: string
          nombre: string
          reservation_id: string
        }[]
      }
      lookup_alumno_by_email: {
        Args: { p_email: string }
        Returns: {
          estado: string
          grupo: string
          id: string
          nombre: string
        }[]
      }
      lookup_alumno_duplicate: {
        Args: { p_documento?: string; p_email?: string; p_telefono?: string }
        Returns: {
          email_enmascarado: string
          estado: string
          motivo: string
          nombre_parcial: string
        }[]
      }
      marcar_baja_evitada: {
        Args: { p_motivo: string; p_solicitud_id: string }
        Returns: undefined
      }
      marcar_pago_verificado: {
        Args: {
          _fuente: string
          _nota?: string
          _registro_id: string
          _verificado?: boolean
        }
        Returns: undefined
      }
      mark_admin_section_seen: {
        Args: { p_section_key: string }
        Returns: undefined
      }
      mark_cash_collected: {
        Args: {
          _announcement_id: string
          _notes?: string
          _payment_date?: string
        }
        Returns: Json
      }
      mark_turnera_reservations_seen: { Args: never; Returns: number }
      mark_waitlist_entries_seen: { Args: never; Returns: number }
      mark_waitlist_entries_seen_for_template: {
        Args: { p_template_id: string }
        Returns: number
      }
      materialize_reservation_installments: {
        Args: { p_reservation_id: string }
        Returns: number
      }
      merge_alumnos: {
        Args: { _duplicado_id: string; _principal_id: string }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      mp_egreso_to_ejecucion: {
        Args: {
          _ejecucion_id: string
          _es_excedente?: boolean
          _movement_id: string
          _notas?: string
        }
        Returns: string
      }
      mp_egreso_to_gasto: {
        Args: {
          _categoria: string
          _descripcion: string
          _movement_id: string
          _notas: string
          _proveedor: string
          _subcategoria: string
          _unidad_negocio: string
        }
        Returns: string
      }
      normalizar_nombre: { Args: { _t: string }; Returns: string }
      normalizar_telefono_ar: { Args: { _t: string }; Returns: string }
      obligacion_imputado: {
        Args: { _id: string; _tipo: string }
        Returns: number
      }
      obligacion_monto: {
        Args: { _id: string; _tipo: string }
        Returns: number
      }
      obligacion_saldo: {
        Args: { _id: string; _tipo: string }
        Returns: number
      }
      pago_consumido_legacy: {
        Args: { _id: string; _tipo: string }
        Returns: boolean
      }
      pago_monto_bruto: {
        Args: { _id: string; _tipo: string }
        Returns: number
      }
      pago_monto_imputado: {
        Args: { _id: string; _tipo: string }
        Returns: number
      }
      pago_saldo_disponible: {
        Args: { _id: string; _tipo: string }
        Returns: number
      }
      pay_gasto_ejecucion: {
        Args: {
          p_fecha: string
          p_forma_pago: string
          p_id: string
          p_monto: number
          p_notas?: string
        }
        Returns: string
      }
      pay_liquidacion_coach: {
        Args: {
          p_coach_id: string
          p_liquidacion_id: string
          p_mes: string
          p_moneda?: string
          p_monto: number
        }
        Returns: undefined
      }
      preview_baja_programa: {
        Args: { _suscripcion_id: string }
        Returns: Json
      }
      preview_merge_alumnos: {
        Args: { _duplicado_id: string; _principal_id: string }
        Returns: Json
      }
      preview_package_change: {
        Args: {
          p_package_nuevo_id: string
          p_price_override?: number
          p_reservation_id: string
          p_roommate_propuesto_id?: string
        }
        Returns: Json
      }
      preview_supplier_shortage_vs_delivery: {
        Args: { _list_id: string; _order_id: string }
        Returns: {
          a_quitar: number
          en_lista: number
          faltante: number
          pedido: number
          producto: string
          recibido: number
          variante: string
        }[]
      }
      publish_month: { Args: { p_mes: string }; Returns: number }
      reactivar_alumno: { Args: { p_alumno_id: string }; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reasignar_imputacion: {
        Args: {
          _id: string
          _motivo?: string
          _obligacion_id: string
          _obligacion_tipo: string
        }
        Returns: string
      }
      reassign_payment_to_installment: {
        Args: {
          p_admin_note?: string
          p_payment_id: string
          p_target_installment_id: string
        }
        Returns: Json
      }
      rebalance_reservation_installments: {
        Args: { p_reservation_id: string }
        Returns: number
      }
      rebuild_facturacion_cola: { Args: { p_since?: string }; Returns: Json }
      recalc_gasto_ejecucion: {
        Args: { p_ejec_id: string }
        Returns: undefined
      }
      recalculate_reservation_amount_total: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      recalculate_reservation_payment_totals: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      redeem_promo_code: {
        Args: { _alumno_id: string; _codigo: string; _evento_id: string }
        Returns: Json
      }
      refresh_backfill_preview: { Args: never; Returns: string }
      register_coach: {
        Args: { _email: string; _nombre: string; _user_id: string }
        Returns: undefined
      }
      register_gasto_deuda_cargo: {
        Args: {
          p_concepto?: string
          p_fecha: string
          p_monto: number
          p_notas?: string
          p_rec_id: string
          p_tipo: string
        }
        Returns: string
      }
      register_gasto_deuda_pago: {
        Args: {
          p_fecha: string
          p_forma_pago: string
          p_monto: number
          p_notas?: string
          p_rec_id: string
        }
        Returns: string
      }
      register_gasto_pago: {
        Args: {
          p_ejec_id: string
          p_fecha: string
          p_forma_pago: string
          p_monto: number
          p_notas?: string
        }
        Returns: string
      }
      register_gasto_pago_v2:
        | {
            Args: {
              p_ejec_id: string
              p_es_excedente?: boolean
              p_fecha: string
              p_forma_pago: string
              p_monto: number
              p_motivo_excedente?: string
              p_notas?: string
              p_nuevo_previsto?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_ejec_id: string
              p_es_excedente?: boolean
              p_fecha: string
              p_forma_pago: string
              p_monto: number
              p_motivo_excedente?: string
              p_notas?: string
              p_nuevo_previsto?: number
              p_sync_catalogo?: boolean
            }
            Returns: string
          }
      registrar_devolucion: {
        Args: {
          p_alumno_id: string
          p_baja_solicitud_id?: string
          p_fecha?: string
          p_metodo?: string
          p_moneda?: string
          p_monto: number
          p_motivo?: string
          p_notas?: string
          p_referencia?: string
          p_suscripcion_id?: string
        }
        Returns: string
      }
      reject_roommate_invitation: {
        Args: { _roommate_id: string }
        Returns: Json
      }
      release_room_on_cancel: {
        Args: { _liberar: boolean; _reservation_id: string }
        Returns: Json
      }
      relink_reservation_payment_plan: {
        Args: { p_note?: string; p_reservation_id: string }
        Returns: Json
      }
      reopen_delivery_cash: { Args: { p_list_id: string }; Returns: undefined }
      reparar_cancelacion_legacy_stock: {
        Args: { p_order_id: string; p_user_id?: string }
        Returns: Json
      }
      reparar_egreso_capado_legacy: {
        Args: { p_movement_id: string; p_user_id?: string }
        Returns: Json
      }
      report_excepciones_revision_manual: {
        Args: never
        Returns: {
          alumno_id: string
          alumno_nombre: string
          diferencia: number
          estado: string
          fecha_fin: string
          fecha_inicio: string
          motivo: string
          motivo_revision: string
          plan_id: string
          plan_nombre: string
          precio_base: number
          precio_final: number
          suscripcion_id: string
        }[]
      }
      report_precio_final_final_estado: {
        Args: never
        Returns: {
          alumno_nombre: string
          clasificacion: string
          diferencia: number
          estado: string
          fecha_fin: string
          fecha_inicio: string
          plan_nombre: string
          precio_base: number
          precio_final: number
          precio_proxima_renovacion: number
          suscripcion_id: string
          tratamiento: string
        }[]
      }
      report_precio_final_sin_respaldo: {
        Args: never
        Returns: {
          alumno_id: string
          alumno_nombre: string
          clasificacion: string
          diferencia: number
          estado: string
          fecha_fin: string
          fecha_inicio: string
          plan_id: string
          plan_nombre: string
          precio_base: number
          precio_final: number
          suscripcion_id: string
        }[]
      }
      request_alumno_email_link: {
        Args: {
          p_documento?: string
          p_nuevo_email: string
          p_telefono?: string
        }
        Returns: {
          alumno_id: string
          destino_email: string
          destino_enmascarado: string
          motivo: string
          nombre_completo: string
          token: string
        }[]
      }
      request_baja_alumno: {
        Args: {
          p_alumno_id: string
          p_comentario?: string
          p_motivo: string
          p_motivo_otro_detalle?: string
          p_origen?: string
        }
        Returns: string
      }
      request_cambio_indumentaria: {
        Args: {
          p_comentario: string
          p_compra_id: string
          p_fotos: string[]
          p_motivo: Database["public"]["Enums"]["cambio_motivo"]
          p_origen_tipo: string
          p_preorder_id: string
          p_producto_id: string
          p_variante_destino: Json
          p_variante_origen: Json
        }
        Returns: string
      }
      reschedule_installment: {
        Args: {
          p_installment_id: string
          p_new_due_date: string
          p_reason: string
        }
        Returns: undefined
      }
      resolve_alumno_for_enrollment: {
        Args: {
          _apellido: string
          _email: string
          _nombre: string
          _telefono?: string
        }
        Returns: Json
      }
      resolve_cash_announcement: {
        Args: {
          _announcement_id: string
          _motivo?: string
          _new_status: string
        }
        Returns: Json
      }
      resolve_variant_key: {
        Args: { p_product_id: string; p_variante: string }
        Returns: string
      }
      reuse_pending_subscription: {
        Args: {
          p_alumno_id: string
          p_descuento_id: string
          p_estado: string
          p_metodo_pago?: string
          p_notas?: string
          p_origen_registro?: string
          p_plan_id: string
          p_precio_base: number
          p_precio_final: number
          p_sub_id: string
        }
        Returns: string
      }
      revertir_clase_bono: { Args: { p_clase_id: string }; Returns: undefined }
      run_backfill_preview_tests: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          nombre: string
          test: number
        }[]
      }
      run_financial_regression_tests: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          nombre: string
          test: number
        }[]
      }
      run_financial_regression_tests_core: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          nombre: string
          test: number
        }[]
      }
      run_imputaciones_regression_tests: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          nombre: string
          test: number
        }[]
      }
      run_programa_bajas_tests: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          nombre: string
          test: number
        }[]
      }
      run_store_stock_tests: {
        Args: never
        Returns: {
          detalle: string
          estado: string
          nombre: string
          test: number
        }[]
      }
      split_mp_movement_among_alumnos: {
        Args: { _movement_id: string; _notes?: string; _splits: Json }
        Returns: Json
      }
      start_pausa_alumno: {
        Args: { p_alumno_id: string; p_fecha_regreso: string }
        Returns: Json
      }
      start_stock_count: { Args: { p_categoria: string }; Returns: Json }
      start_vehiculo_chequeo: {
        Args: { _carga_id: string; _responsable_nombre?: string }
        Returns: {
          carga_id: string
          closed_at: string | null
          created_at: string
          estado: string
          id: string
          notas: string | null
          responsable_nombre: string | null
          responsable_user_id: string | null
          resumen: Json | null
          ronda: number
          started_at: string
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "vehiculo_chequeos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stock_control_desde: { Args: never; Returns: string }
      store_order_compromete_stock: {
        Args: { p_status: string }
        Returns: boolean
      }
      store_order_estados_comprometidos: { Args: never; Returns: string[] }
      submit_survey_response: {
        Args: { _nps?: number; _respuestas: Json; _token: string }
        Returns: string
      }
      submit_waitlist_entry: {
        Args: {
          p_alumno_id: string
          p_dni: string
          p_email: string
          p_event_id: string
          p_nombre: string
          p_respuestas: Json
          p_telefono: string
          p_user_agent: string
        }
        Returns: Json
      }
      subscription_paid_amount: { Args: { _sub_id: string }; Returns: number }
      sync_event_externals_to_marketing: { Args: never; Returns: number }
      sync_ex_alumnos_to_marketing: { Args: never; Returns: number }
      sync_reservation_package_from_room: {
        Args: {
          p_reservation_id: string
          p_room_package_id: string
          p_source?: string
        }
        Returns: Json
      }
      transition_cambio_estado: {
        Args: {
          p_id: string
          p_nota?: string
          p_nuevo_estado: Database["public"]["Enums"]["cambio_estado"]
        }
        Returns: undefined
      }
      unassign_mp_movement: { Args: { _movement_id: string }; Returns: Json }
      update_gasto_deuda_mov: {
        Args: {
          p_concepto?: string
          p_fecha: string
          p_forma_pago?: string
          p_id: string
          p_monto: number
          p_notas?: string
        }
        Returns: undefined
      }
      update_gasto_pago: {
        Args: {
          p_fecha: string
          p_forma_pago: string
          p_monto: number
          p_notas?: string
          p_pago_id: string
        }
        Returns: undefined
      }
      user_matches_tarea_rol: {
        Args: {
          _rol: Database["public"]["Enums"]["tarea_rol"]
          _user_id: string
        }
        Returns: boolean
      }
      validate_survey_token: {
        Args: { _token: string }
        Returns: {
          alumno_id: string
          event_id: string
          external_participant_id: string
          recipient_email: string
          recipient_name: string
          survey_id: string
          used_at: string
        }[]
      }
    }
    Enums: {
      admin_role: "super_admin" | "admin" | "support" | "deposito"
      app_role: "admin" | "alumno" | "coach" | "deposito"
      cambio_estado:
        | "solicitado"
        | "aprobado"
        | "en_deposito"
        | "listo_retiro"
        | "entregado"
        | "rechazado"
        | "cancelado"
        | "devolucion_solicitada"
      cambio_iniciador: "alumno" | "admin"
      cambio_metodo: "qr" | "manual"
      cambio_motivo: "talle" | "color" | "defecto" | "otro"
      cambio_origen: "app" | "presencial"
      cambio_reemplazo_estado:
        | "sin_definir"
        | "pendiente_envio"
        | "enviado"
        | "entregado"
      estado_plan: "borrador" | "publicado"
      event_payment_mode: "cuotas" | "simple"
      event_type: "record_hora" | "camp" | "carrera" | "otro" | "viaje"
      gasto_ambito: "personal" | "emprendimiento" | "mixto"
      gasto_deuda_tipo: "cargo" | "ajuste" | "pago"
      gasto_ejecucion_estado:
        | "pendiente"
        | "pagado"
        | "vencido"
        | "omitido"
        | "parcial"
      gasto_frecuencia:
        | "mensual"
        | "bimestral"
        | "trimestral"
        | "semestral"
        | "anual"
        | "variable"
      grupo_ciclismo:
        | "G1"
        | "G2"
        | "G3"
        | "G4"
        | "Sin grupo"
        | "Principiante"
        | "Personalizado"
        | "Aspirantes"
      installment_reminder_channel: "email" | "whatsapp_manual" | "admin_alert"
      installment_reminder_recipient: "alumno" | "admin"
      installment_reminder_status: "pending" | "sent" | "failed" | "skipped"
      installment_type_enum: "sena" | "cuota"
      marketing_contact_type:
        | "lead"
        | "ex_alumno"
        | "evento_externo"
        | "manual"
        | "importado"
        | "whatsapp_web"
        | "cliente_tienda"
      modo_mp: "test" | "prod"
      payment_plan_monto_tipo: "fijo" | "porcentaje_saldo"
      payment_plan_regla_tardia:
        | "cobrar_al_reservar"
        | "reprogramar_a_hoy"
        | "mantener_fechas_fijas"
      payment_plan_sena_tipo: "monto_fijo" | "porcentaje_paquete"
      process_accion_final: "none" | "send_report" | "send_cohort_email"
      process_entidad_control:
        | "none"
        | "store_preorder"
        | "supplier_order"
        | "cohort_task"
        | "cohort_kpi"
      process_instance_estado: "en_curso" | "completada" | "cancelada"
      process_stage_estado: "pendiente" | "en_curso" | "completada"
      tarea_estado: "pendiente" | "en_curso" | "hecha" | "pospuesta"
      tarea_prioridad: "baja" | "media" | "alta" | "critica"
      tarea_rol: "super_admin" | "admin" | "coach" | "deposito"
      tarea_tipo: "automatica" | "manual" | "recurrente"
      tipo_entrenamiento: "ruta" | "rodillo" | "gimnasio" | "tecnica"
      unidad_negocio_mp:
        | "suscripcion_escuela"
        | "viaje_camp"
        | "evento"
        | "tienda"
        | "preventa"
        | "personalizado"
        | "turnera"
        | "otro"
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
      admin_role: ["super_admin", "admin", "support", "deposito"],
      app_role: ["admin", "alumno", "coach", "deposito"],
      cambio_estado: [
        "solicitado",
        "aprobado",
        "en_deposito",
        "listo_retiro",
        "entregado",
        "rechazado",
        "cancelado",
        "devolucion_solicitada",
      ],
      cambio_iniciador: ["alumno", "admin"],
      cambio_metodo: ["qr", "manual"],
      cambio_motivo: ["talle", "color", "defecto", "otro"],
      cambio_origen: ["app", "presencial"],
      cambio_reemplazo_estado: [
        "sin_definir",
        "pendiente_envio",
        "enviado",
        "entregado",
      ],
      estado_plan: ["borrador", "publicado"],
      event_payment_mode: ["cuotas", "simple"],
      event_type: ["record_hora", "camp", "carrera", "otro", "viaje"],
      gasto_ambito: ["personal", "emprendimiento", "mixto"],
      gasto_deuda_tipo: ["cargo", "ajuste", "pago"],
      gasto_ejecucion_estado: [
        "pendiente",
        "pagado",
        "vencido",
        "omitido",
        "parcial",
      ],
      gasto_frecuencia: [
        "mensual",
        "bimestral",
        "trimestral",
        "semestral",
        "anual",
        "variable",
      ],
      grupo_ciclismo: [
        "G1",
        "G2",
        "G3",
        "G4",
        "Sin grupo",
        "Principiante",
        "Personalizado",
        "Aspirantes",
      ],
      installment_reminder_channel: ["email", "whatsapp_manual", "admin_alert"],
      installment_reminder_recipient: ["alumno", "admin"],
      installment_reminder_status: ["pending", "sent", "failed", "skipped"],
      installment_type_enum: ["sena", "cuota"],
      marketing_contact_type: [
        "lead",
        "ex_alumno",
        "evento_externo",
        "manual",
        "importado",
        "whatsapp_web",
        "cliente_tienda",
      ],
      modo_mp: ["test", "prod"],
      payment_plan_monto_tipo: ["fijo", "porcentaje_saldo"],
      payment_plan_regla_tardia: [
        "cobrar_al_reservar",
        "reprogramar_a_hoy",
        "mantener_fechas_fijas",
      ],
      payment_plan_sena_tipo: ["monto_fijo", "porcentaje_paquete"],
      process_accion_final: ["none", "send_report", "send_cohort_email"],
      process_entidad_control: [
        "none",
        "store_preorder",
        "supplier_order",
        "cohort_task",
        "cohort_kpi",
      ],
      process_instance_estado: ["en_curso", "completada", "cancelada"],
      process_stage_estado: ["pendiente", "en_curso", "completada"],
      tarea_estado: ["pendiente", "en_curso", "hecha", "pospuesta"],
      tarea_prioridad: ["baja", "media", "alta", "critica"],
      tarea_rol: ["super_admin", "admin", "coach", "deposito"],
      tarea_tipo: ["automatica", "manual", "recurrente"],
      tipo_entrenamiento: ["ruta", "rodillo", "gimnasio", "tecnica"],
      unidad_negocio_mp: [
        "suscripcion_escuela",
        "viaje_camp",
        "evento",
        "tienda",
        "preventa",
        "personalizado",
        "turnera",
        "otro",
      ],
    },
  },
} as const
