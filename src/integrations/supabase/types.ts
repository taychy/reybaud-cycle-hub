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
      alumnos: {
        Row: {
          apellido: string | null
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
          sede_id: string | null
          telefono: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          apellido?: string | null
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
          sede_id?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          apellido?: string | null
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
          sede_id?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alumnos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
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
          user_id: string
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
          user_id: string
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
          user_id?: string
          user_role?: string
        }
        Relationships: []
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
          id: string
          nota: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          alumno_id: string
          asignado_por?: string | null
          created_at?: string
          descuento_id: string
          id?: string
          nota?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          alumno_id?: string
          asignado_por?: string | null
          created_at?: string
          descuento_id?: string
          id?: string
          nota?: string | null
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
      emisores_fiscales: {
        Row: {
          activo: boolean
          cert_pem: string | null
          created_at: string
          cuit: string
          id: string
          key_pem: string | null
          nombre_fiscal: string
          punto_venta: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cert_pem?: string | null
          created_at?: string
          cuit: string
          id?: string
          key_pem?: string | null
          nombre_fiscal: string
          punto_venta?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cert_pem?: string | null
          created_at?: string
          cuit?: string
          id?: string
          key_pem?: string | null
          nombre_fiscal?: string
          punto_venta?: number
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
      event_announcements: {
        Row: {
          category: string
          content: string
          created_at: string
          event_id: string
          id: string
          is_highlighted: boolean
          published_at: string
          sort_order: number
          title: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          event_id: string
          id?: string
          is_highlighted?: boolean
          published_at?: string
          sort_order?: number
          title: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          event_id?: string
          id?: string
          is_highlighted?: boolean
          published_at?: string
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
      event_reservations: {
        Row: {
          accepted_terms: boolean
          admin_notes: string | null
          alumno_id: string
          amount_paid: number
          amount_total: number | null
          balance_due: number | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string
          currency_snapshot: string | null
          estado: string
          event_id: string
          id: string
          metodo_pago: string
          moneda: string
          monto: number | null
          next_due_date: string | null
          notas: string | null
          participant_notes: string | null
          payment_status: string
          price_snapshot: number | null
          reservation_status: string
          updated_at: string
        }
        Insert: {
          accepted_terms?: boolean
          admin_notes?: string | null
          alumno_id: string
          amount_paid?: number
          amount_total?: number | null
          balance_due?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          currency_snapshot?: string | null
          estado?: string
          event_id: string
          id?: string
          metodo_pago?: string
          moneda?: string
          monto?: number | null
          next_due_date?: string | null
          notas?: string | null
          participant_notes?: string | null
          payment_status?: string
          price_snapshot?: number | null
          reservation_status?: string
          updated_at?: string
        }
        Update: {
          accepted_terms?: boolean
          admin_notes?: string | null
          alumno_id?: string
          amount_paid?: number
          amount_total?: number | null
          balance_due?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          currency_snapshot?: string | null
          estado?: string
          event_id?: string
          id?: string
          metodo_pago?: string
          moneda?: string
          monto?: number | null
          next_due_date?: string | null
          notas?: string | null
          participant_notes?: string | null
          payment_status?: string
          price_snapshot?: number | null
          reservation_status?: string
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
      events: {
        Row: {
          created_at: string
          currency: string
          date: string
          description: string | null
          duration_days: number | null
          duration_nights: number | null
          end_date: string | null
          end_time: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_own_event: boolean
          level: string | null
          location: string | null
          max_capacity: number | null
          metadata: Json
          price: number | null
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
          created_at?: string
          currency?: string
          date: string
          description?: string | null
          duration_days?: number | null
          duration_nights?: number | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_own_event?: boolean
          level?: string | null
          location?: string | null
          max_capacity?: number | null
          metadata?: Json
          price?: number | null
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
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          duration_days?: number | null
          duration_nights?: number | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_own_event?: boolean
          level?: string | null
          location?: string | null
          max_capacity?: number | null
          metadata?: Json
          price?: number | null
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
          emisor_id: string | null
          error_detalle: string | null
          estado: string
          fecha_emision: string | null
          id: string
          monto: number
          numero_comprobante: string | null
          referencia_id: string | null
          referencia_tipo: string
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
          emisor_id?: string | null
          error_detalle?: string | null
          estado?: string
          fecha_emision?: string | null
          id?: string
          monto: number
          numero_comprobante?: string | null
          referencia_id?: string | null
          referencia_tipo?: string
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
          emisor_id?: string | null
          error_detalle?: string | null
          estado?: string
          fecha_emision?: string | null
          id?: string
          monto?: number
          numero_comprobante?: string | null
          referencia_id?: string | null
          referencia_tipo?: string
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
          fecha: string
          forma_pago: string
          frecuencia: string | null
          id: string
          moneda: string
          monto: number
          notas: string | null
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
          fecha?: string
          forma_pago?: string
          frecuencia?: string | null
          id?: string
          moneda?: string
          monto: number
          notas?: string | null
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
          fecha?: string
          forma_pago?: string
          frecuencia?: string | null
          id?: string
          moneda?: string
          monto?: number
          notas?: string | null
          proveedor?: string | null
          recurrente?: boolean
          registrado_por?: string | null
          subcategoria?: string | null
          updated_at?: string
        }
        Relationships: []
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
          activo: boolean
          clases_por_semana: number | null
          created_at: string
          cuota_valor: number | null
          cuotas_cantidad: number | null
          descripcion: string | null
          descripcion_corta: string | null
          frecuencia: string
          id: string
          imagen_url: string | null
          inscripciones_actuales: number
          max_inscripciones: number | null
          moneda: string
          nombre: string
          precio: number
          precio_promocional: number | null
          renovacion_auto_permitida: boolean
          tipo: string
          updated_at: string
          visibilidad: string
          whatsapp_url: string | null
        }
        Insert: {
          acceso_beneficios?: boolean
          acceso_entrenamientos?: boolean
          acceso_eventos?: boolean
          activo?: boolean
          clases_por_semana?: number | null
          created_at?: string
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          frecuencia: string
          id?: string
          imagen_url?: string | null
          inscripciones_actuales?: number
          max_inscripciones?: number | null
          moneda?: string
          nombre: string
          precio: number
          precio_promocional?: number | null
          renovacion_auto_permitida?: boolean
          tipo?: string
          updated_at?: string
          visibilidad?: string
          whatsapp_url?: string | null
        }
        Update: {
          acceso_beneficios?: boolean
          acceso_entrenamientos?: boolean
          acceso_eventos?: boolean
          activo?: boolean
          clases_por_semana?: number | null
          created_at?: string
          cuota_valor?: number | null
          cuotas_cantidad?: number | null
          descripcion?: string | null
          descripcion_corta?: string | null
          frecuencia?: string
          id?: string
          imagen_url?: string | null
          inscripciones_actuales?: number
          max_inscripciones?: number | null
          moneda?: string
          nombre?: string
          precio?: number
          precio_promocional?: number | null
          renovacion_auto_permitida?: boolean
          tipo?: string
          updated_at?: string
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
          created_at: string
          documento: string | null
          email: string
          estado_economico: string
          estado_operativo: string
          fecha: string
          fecha_nacimiento: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          moneda_snapshot: string | null
          nombre: string
          nota: string | null
          origen_link: string | null
          precio_snapshot: number | null
          sede_id: string | null
          servicio_id: string
          updated_at: string
        }
        Insert: {
          acepto_politica?: boolean
          alumno_id?: string | null
          apellido: string
          celular?: string | null
          coach_id: string
          created_at?: string
          documento?: string | null
          email: string
          estado_economico?: string
          estado_operativo?: string
          fecha: string
          fecha_nacimiento?: string | null
          hora_fin: string
          hora_inicio: string
          id?: string
          moneda_snapshot?: string | null
          nombre: string
          nota?: string | null
          origen_link?: string | null
          precio_snapshot?: number | null
          sede_id?: string | null
          servicio_id: string
          updated_at?: string
        }
        Update: {
          acepto_politica?: boolean
          alumno_id?: string | null
          apellido?: string
          celular?: string | null
          coach_id?: string
          created_at?: string
          documento?: string | null
          email?: string
          estado_economico?: string
          estado_operativo?: string
          fecha?: string
          fecha_nacimiento?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          moneda_snapshot?: string | null
          nombre?: string
          nota?: string | null
          origen_link?: string | null
          precio_snapshot?: number | null
          sede_id?: string | null
          servicio_id?: string
          updated_at?: string
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
      reservation_payments: {
        Row: {
          alumno_id: string
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          payment_reference: string | null
          proof_url: string | null
          reservation_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          alumno_id: string
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          proof_url?: string | null
          reservation_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          alumno_id?: string
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          proof_url?: string | null
          reservation_id?: string
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
            foreignKeyName: "reservation_payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "event_reservations"
            referencedColumns: ["id"]
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
          created_at: string
          descripcion: string | null
          duracion_minutos: number
          id: string
          modalidad: string | null
          moneda: string
          nombre: string
          politica_cancelacion: string | null
          precio: number | null
          sede_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number
          id?: string
          modalidad?: string | null
          moneda?: string
          nombre: string
          politica_cancelacion?: string | null
          precio?: number | null
          sede_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number
          id?: string
          modalidad?: string | null
          moneda?: string
          nombre?: string
          politica_cancelacion?: string | null
          precio?: number | null
          sede_id?: string | null
          slug?: string
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
      stock_movements: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          motivo: string | null
          product_id: string
          registrado_por: string | null
          stock_anterior: number
          stock_nuevo: number
          tipo: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          motivo?: string | null
          product_id: string
          registrado_por?: string | null
          stock_anterior: number
          stock_nuevo: number
          tipo?: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          motivo?: string | null
          product_id?: string
          registrado_por?: string | null
          stock_anterior?: number
          stock_nuevo?: number
          tipo?: string
        }
        Relationships: [
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
      store_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
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
          created_at: string
          customer_email: string | null
          customer_name: string
          id: string
          notes: string | null
          order_number: number
          shipping_tracking: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          alumno_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          id?: string
          notes?: string | null
          order_number?: number
          shipping_tracking?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          alumno_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          id?: string
          notes?: string | null
          order_number?: number
          shipping_tracking?: string | null
          status?: string
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
        ]
      }
      store_products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          discount: number | null
          featured: boolean
          featured_order: number | null
          id: string
          image_url: string | null
          min_stock: number
          name: string
          old_price: number | null
          price: number
          status: string
          stock: number
          tag: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount?: number | null
          featured?: boolean
          featured_order?: number | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          old_price?: number | null
          price: number
          status?: string
          stock?: number
          tag?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount?: number | null
          featured?: boolean
          featured_order?: number | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          old_price?: number | null
          price?: number
          status?: string
          stock?: number
          tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "store_categories"
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
      suscripciones: {
        Row: {
          alumno_id: string
          auto_renovacion: boolean
          cancelada_at: string | null
          cancelada_motivo: string | null
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
          auto_renovacion?: boolean
          cancelada_at?: string | null
          cancelada_motivo?: string | null
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
          auto_renovacion?: boolean
          cancelada_at?: string | null
          cancelada_motivo?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_admin_or_coach_email: { Args: { _email: string }; Returns: boolean }
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
      app_role: "admin" | "alumno" | "coach" | "deposito"
      estado_plan: "borrador" | "publicado"
      event_type: "record_hora" | "camp" | "carrera" | "otro" | "viaje"
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
      app_role: ["admin", "alumno", "coach", "deposito"],
      estado_plan: ["borrador", "publicado"],
      event_type: ["record_hora", "camp", "carrera", "otro", "viaje"],
      grupo_ciclismo: ["G1", "G2", "G3", "G4", "Sin grupo", "Principiante"],
      tipo_entrenamiento: ["ruta", "rodillo", "gimnasio", "tecnica"],
    },
  },
} as const
