import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Session } from "@supabase/supabase-js";

type Alumno = Tables<"alumnos">;

interface AlumnoSessionState {
  alumno: Alumno | null;
  loading: boolean;
  error: string | null;
  needsSubscription: boolean;
}

export function useAlumnoSession() {
  const [state, setState] = useState<AlumnoSessionState>({
    alumno: null,
    loading: true,
    error: null,
    needsSubscription: false,
  });

  const resolveAlumno = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setState({ alumno: null, loading: false, error: null, needsSubscription: false });
      return;
    }

    const email = session.user.email?.toLowerCase().trim();
    if (!email) {
      setState({ alumno: null, loading: false, error: "No se encontró email en la sesión.", needsSubscription: false });
      return;
    }

    // Look up alumno by email
    const { data: alumnoData, error: fetchError } = await supabase
      .from("alumnos")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (fetchError) {
      setState({ alumno: null, loading: false, error: "Error al buscar el usuario.", needsSubscription: false });
      return;
    }

    if (!alumnoData) {
      setState({ alumno: null, loading: false, error: "No se encontró un alumno con ese email.", needsSubscription: false });
      return;
    }

    // Link user_id if not set
    if (!alumnoData.user_id) {
      await supabase
        .from("alumnos")
        .update({ user_id: session.user.id })
        .eq("id", alumnoData.id);
      alumnoData.user_id = session.user.id;
    }

    // Validate status
    if (alumnoData.grupo === "Sin grupo" && alumnoData.estado !== "inactivo") {
      setState({ alumno: null, loading: false, error: "Tu usuario aún no tiene grupo asignado. Contactá administración.", needsSubscription: false });
      return;
    }

    // Check active subscription
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { data: activeSub } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("alumno_id", alumnoData.id)
      .eq("estado", "activa")
      .gte("fecha_fin", todayStr)
      .limit(1);

    if (!activeSub || activeSub.length === 0) {
      // Needs subscription — caller decides how to handle
      setState({ alumno: alumnoData, loading: false, error: null, needsSubscription: true });
      return;
    }

    setState({ alumno: alumnoData, loading: false, error: null, needsSubscription: false });
  }, []);

  useEffect(() => {
    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveAlumno(session);
    });

    // Then check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolveAlumno(session);
    });

    return () => subscription.unsubscribe();
  }, [resolveAlumno]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    // Clear any legacy localStorage
    localStorage.removeItem("alumno");
    setState({ alumno: null, loading: false, error: null, needsSubscription: false });
  }, []);

  return { ...state, logout };
}
