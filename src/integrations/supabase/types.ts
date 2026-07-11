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
            foreignKeyName: "alumno_familiares_familiar_alumno_id_fkey"
            columns: ["familiar_alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
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
          estado: string
          fecha_baja: string | null
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
          estado?: string
          fecha_baja?: string | null
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
          estado?: string
          fecha_baja?: string | null
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
            foreignKeyName: "cambios_plan_plan_anterior_id_fkey"
            columns: ["plan_anterior_id"]
            isOneToOne: false
            referencedRelation: "planes"
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
            foreignKeyName: "cambios_plan_suscripcion_anterior_id_fkey"
            columns: ["suscripcion_anterior_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_plan_suscripcion_nueva_id_fkey"
            columns: ["suscripcion_nueva_id"]
            isOneToOne: false
            referencedRelation: "suscripciones"
            referencedColumns: ["id"]
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
        Relationships: []
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
      event_external_participants: {
        Row: {
          apellido: string | null
          created_at: string
          documento: string | null
          email: string
          estado: string
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          apellido?: string | null
          created_at?: string
          documento?: string | null
          email: string
          estado?: string
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          apellido?: string | null
          created_at?: string
          documento?: string | null
          email?: string
          estado?: string
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
          nombre: string
          permite_mixto: boolean
          personas_por_habitacion: number
          precio: number
          sena: number | null
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
          nombre: string
          permite_mixto?: boolean
          personas_por_habitacion?: number
          precio: number
          sena?: number | null
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
          nombre?: string
          permite_mixto?: boolean
          personas_por_habitacion?: number
          precio?: number
          sena?: number | null
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
            foreignKeyName: "event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
          descuento_cta_label: string | null
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
          descuento_cta_label?: string | null
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
          descuento_cta_label?: string | null
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
            foreignKeyName: "event_surveys_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
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
          fecha_emision: string | null
          id: string
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
          fecha_emision?: string | null
          id?: string
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
          fecha_emision?: string | null
          id?: string
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
        ]
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
            foreignKeyName: "feedback_coach_coach_id_fkey"
            columns: ["coach_id"]
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
          apellido: string | null
          created_at: string
          created_by: string | null
          email: string
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
          tipo: Database["public"]["Enums"]["marketing_contact_type"]
          updated_at: string
        }
        Insert: {
          apellido?: string | null
          created_at?: string
          created_by?: string | null
          email: string
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
          tipo?: Database["public"]["Enums"]["marketing_contact_type"]
          updated_at?: string
        }
        Update: {
          apellido?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
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
          tipo?: Database["public"]["Enums"]["marketing_contact_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contacts_source_alumno_id_fkey"
            columns: ["source_alumno_id"]
            isOneToOne: false
            referencedRelation: "alumnos"
            referencedColumns: ["id"]
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
          created_at: string
          cuenta_mp_id: string
          currency: string
          description: string | null
          external_reference: string | null
          fecha_movimiento: string
          fee_amount: number | null
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
          created_at?: string
          cuenta_mp_id: string
          currency?: string
          description?: string | null
          external_reference?: string | null
          fecha_movimiento: string
          fee_amount?: number | null
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
          created_at?: string
          cuenta_mp_id?: string
          currency?: string
          description?: string | null
          external_reference?: string | null
          fecha_movimiento?: string
          fee_amount?: number | null
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
            foreignKeyName: "mp_account_movements_cuenta_mp_id_fkey"
            columns: ["cuenta_mp_id"]
            isOneToOne: false
            referencedRelation: "cuentas_mp"
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
          created_at: string
          cuota_valor: number | null
          cuotas_cantidad: number | null
          descripcion: string | null
          descripcion_corta: string | null
          features: Json
          frecuencia: string
          id: string
          imagen_url: string | null
          inscripciones_actuales: number
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
          created_at?: string
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          features?: Json
          frecuencia: string
          id?: string
          imagen_url?: string | null
          inscripciones_actuales?: number
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
          created_at?: string
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          features?: Json
          frecuencia?: string
          id?: string
          imagen_url?: string | null
          inscripciones_actuales?: number
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
        }
        Insert: {
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
        }
        Update: {
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
        }
        Relationships: [
          {
            foreignKeyName: "precio_historial_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
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
          started_at?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
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
          rol_destino?: string
          updated_at?: string
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
          alumno_id: string | null
          apellido: string
          celular: string | null
          coach_id: string
          comprobante_subido_at: string | null
          comprobante_url: string | null
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
          alumno_id?: string | null
          apellido: string
          celular?: string | null
          coach_id: string
          comprobante_subido_at?: string | null
          comprobante_url?: string | null
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
          alumno_id?: string | null
          apellido?: string
          celular?: string | null
          coach_id?: string
          comprobante_subido_at?: string | null
          comprobante_url?: string | null
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
          id: string
          nombre: string
          posicion: number
          reservation_id: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          confirmado?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          posicion: number
          reservation_id: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          confirmado?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          posicion?: number
          reservation_id?: string
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
          created_at: string
          descripcion: string | null
          duracion_minutos: number
          email_coach_enabled: boolean
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
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number
          email_coach_enabled?: boolean
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
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number
          email_coach_enabled?: boolean
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
      stock_movements: {
        Row: {
          cambio_id: string | null
          cantidad: number
          created_at: string
          id: string
          metodo: Database["public"]["Enums"]["cambio_metodo"] | null
          motivo: string | null
          order_id: string | null
          product_id: string
          registrado_por: string | null
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
          product_id: string
          registrado_por?: string | null
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
          product_id?: string
          registrado_por?: string | null
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
          delivered_at: string | null
          entrega_metodo: string | null
          envio_contacto: string | null
          envio_costo: number | null
          envio_direccion: string | null
          envio_estado: string | null
          envio_notas: string | null
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
          tienda_emisor_id: string | null
          total: number
          updated_at: string
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
          delivered_at?: string | null
          entrega_metodo?: string | null
          envio_contacto?: string | null
          envio_costo?: number | null
          envio_direccion?: string | null
          envio_estado?: string | null
          envio_notas?: string | null
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
          tienda_emisor_id?: string | null
          total?: number
          updated_at?: string
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
          delivered_at?: string | null
          entrega_metodo?: string | null
          envio_contacto?: string | null
          envio_costo?: number | null
          envio_direccion?: string | null
          envio_estado?: string | null
          envio_notas?: string | null
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
          tienda_emisor_id?: string | null
          total?: number
          updated_at?: string
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
          created_at: string
          currency: string
          delivery_methods: Json
          description: string | null
          discount: number | null
          external_url: string | null
          featured: boolean
          featured_order: number | null
          id: string
          image_url: string | null
          is_combo: boolean
          is_preorder: boolean
          min_stock: number
          name: string
          no_admite_cambio: boolean
          old_price: number | null
          pickup_sede_ids: string[]
          preorder_deadline: string | null
          preorder_deposit_amount: number | null
          preorder_deposit_percent: number | null
          preorder_description: string | null
          preorder_estimated_delivery: string | null
          preorder_status: string
          preorder_total_units: number | null
          preorder_variants: Json
          price: number
          sena_mode: string | null
          sena_valor: number | null
          sku_base: string | null
          status: string
          stock: number
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
          created_at?: string
          currency?: string
          delivery_methods?: Json
          description?: string | null
          discount?: number | null
          external_url?: string | null
          featured?: boolean
          featured_order?: number | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          is_preorder?: boolean
          min_stock?: number
          name: string
          no_admite_cambio?: boolean
          old_price?: number | null
          pickup_sede_ids?: string[]
          preorder_deadline?: string | null
          preorder_deposit_amount?: number | null
          preorder_deposit_percent?: number | null
          preorder_description?: string | null
          preorder_estimated_delivery?: string | null
          preorder_status?: string
          preorder_total_units?: number | null
          preorder_variants?: Json
          price: number
          sena_mode?: string | null
          sena_valor?: number | null
          sku_base?: string | null
          status?: string
          stock?: number
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
          created_at?: string
          currency?: string
          delivery_methods?: Json
          description?: string | null
          discount?: number | null
          external_url?: string | null
          featured?: boolean
          featured_order?: number | null
          id?: string
          image_url?: string | null
          is_combo?: boolean
          is_preorder?: boolean
          min_stock?: number
          name?: string
          no_admite_cambio?: boolean
          old_price?: number | null
          pickup_sede_ids?: string[]
          preorder_deadline?: string | null
          preorder_deposit_amount?: number | null
          preorder_deposit_percent?: number | null
          preorder_description?: string | null
          preorder_estimated_delivery?: string | null
          preorder_status?: string
          preorder_total_units?: number | null
          preorder_variants?: Json
          price?: number
          sena_mode?: string | null
          sena_valor?: number | null
          sku_base?: string | null
          status?: string
          stock?: number
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
          proveedor_nombre: string
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
          proveedor_nombre: string
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
          proveedor_nombre?: string
          total_estimado?: number | null
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "event_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
      _build_variant_key: {
        Args: { p_product_id: string; p_variante: Json }
        Returns: string
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
      announce_cash_payment: {
        Args: {
          _fecha_limite: string
          _lugar: string
          _nota: string
          _reservation_id: string
        }
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
      auto_resolve_tareas_automaticas: { Args: never; Returns: number }
      build_baja_snapshot: { Args: { p_alumno_id: string }; Returns: Json }
      cancel_store_order:
        | { Args: { _order_id: string; _reason: string }; Returns: Json }
        | { Args: { p_order_id: string }; Returns: undefined }
      cancelar_solicitud_baja: {
        Args: { p_solicitud_id: string }
        Returns: undefined
      }
      check_admin_or_coach_email: { Args: { _email: string }; Returns: boolean }
      classify_package_change: {
        Args: {
          p_package_nuevo_id: string
          p_reservation_id: string
          p_room_impact: Json
        }
        Returns: string
      }
      condone_installment: {
        Args: { p_amount: number; p_installment_id: string; p_reason: string }
        Returns: undefined
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
      consumir_clase_bono: {
        Args: {
          p_coach_id?: string
          p_fecha?: string
          p_notas?: string
          p_suscripcion_id: string
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_gasto_deuda_mov: { Args: { p_id: string }; Returns: undefined }
      delete_gasto_pago: { Args: { p_pago_id: string }; Returns: undefined }
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
      get_my_reservation: {
        Args: { _external_token?: string; _reservation_id: string }
        Returns: Json
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
      get_package_available_spots: {
        Args: { p_package_id: string }
        Returns: number
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
      get_prospect_roadbook: { Args: { _token: string }; Returns: Json }
      get_reservas_turnera_ocupadas: {
        Args: { p_desde: string; p_hasta: string; p_servicio_id: string }
        Returns: {
          coach_id: string
          fecha: string
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
      impute_validated_payments_to_installments: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      lookup_alumno_by_email: {
        Args: { p_email: string }
        Returns: {
          estado: string
          grupo: string
          id: string
          nombre: string
        }[]
      }
      marcar_baja_evitada: {
        Args: { p_motivo: string; p_solicitud_id: string }
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
      materialize_reservation_installments: {
        Args: { p_reservation_id: string }
        Returns: number
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
      preview_package_change: {
        Args: {
          p_package_nuevo_id: string
          p_price_override?: number
          p_reservation_id: string
          p_roommate_propuesto_id?: string
        }
        Returns: Json
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
      reassign_payment_to_installment: {
        Args: {
          p_admin_note?: string
          p_payment_id: string
          p_target_installment_id: string
        }
        Returns: Json
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
      resolve_cash_announcement: {
        Args: {
          _announcement_id: string
          _motivo?: string
          _new_status: string
        }
        Returns: Json
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
      start_pausa_alumno: {
        Args: { p_alumno_id: string; p_fecha_regreso: string }
        Returns: Json
      }
      sync_event_externals_to_marketing: { Args: never; Returns: number }
      sync_ex_alumnos_to_marketing: { Args: never; Returns: number }
      transition_cambio_estado: {
        Args: {
          p_id: string
          p_nota?: string
          p_nuevo_estado: Database["public"]["Enums"]["cambio_estado"]
        }
        Returns: undefined
      }
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
      modo_mp: "test" | "prod"
      payment_plan_monto_tipo: "fijo" | "porcentaje_saldo"
      payment_plan_regla_tardia:
        | "cobrar_al_reservar"
        | "reprogramar_a_hoy"
        | "mantener_fechas_fijas"
      payment_plan_sena_tipo: "monto_fijo" | "porcentaje_paquete"
      process_accion_final: "none" | "send_report"
      process_entidad_control: "none" | "store_preorder" | "supplier_order"
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
      ],
      modo_mp: ["test", "prod"],
      payment_plan_monto_tipo: ["fijo", "porcentaje_saldo"],
      payment_plan_regla_tardia: [
        "cobrar_al_reservar",
        "reprogramar_a_hoy",
        "mantener_fechas_fijas",
      ],
      payment_plan_sena_tipo: ["monto_fijo", "porcentaje_paquete"],
      process_accion_final: ["none", "send_report"],
      process_entidad_control: ["none", "store_preorder", "supplier_order"],
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
