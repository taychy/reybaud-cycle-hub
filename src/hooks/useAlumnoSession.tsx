import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Session } from "@supabase/supabase-js";
import { useImpersonation } from "@/contexts/ImpersonationContext";

type Alumno = Tables<"alumnos">;

interface AlumnoSessionState {
  alumno: Alumno | null;
  loading: boolean;
  error: string | null;
  needsSubscription: boolean;
}

export function useAlumnoSession() {
  const { isImpersonating, targetAlumno } = useImpersonation();
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

    // Self-heal: link user_id if missing OR if it differs from current session
    // (happens when a user re-activates their account and gets a new auth.users id)
    if (!alumnoData.user_id || alumnoData.user_id !== session.user.id) {
      const { error: healError } = await supabase
        .from("alumnos")
        .update({ user_id: session.user.id })
        .eq("id", alumnoData.id);
      if (!healError) {
        alumnoData.user_id = session.user.id;
      }
    }

    // Bloqueado
    if (alumnoData.estado === "bloqueado") {
      setState({ alumno: null, loading: false, error: "Tu acceso está deshabilitado. Si creés que esto es un error, contactate con administración.", needsSubscription: false });
      return;
    }

    // Inactivo
    if (alumnoData.estado === "inactivo") {
      setState({ alumno: null, loading: false, error: "Tu cuenta se encuentra inactiva. Contactate con administración para reactivarla.", needsSubscription: false });
      return;
    }

    // Pendiente
    if (alumnoData.estado === "pendiente") {
      setState({ alumno: null, loading: false, error: "Tu registro está pendiente de aprobación.", needsSubscription: false });
      return;
    }

    // Validate group (except vacaciones)
    if (alumnoData.grupo === "Sin grupo" && alumnoData.estado !== "vacaciones") {
      setState({ alumno: null, loading: false, error: "Tu usuario aún no tiene grupo asignado. Contactá administración.", needsSubscription: false });
      return;
    }

    // Vacaciones: allow access but mark as limited (no subscription needed)
    if (alumnoData.estado === "vacaciones") {
      setState({ alumno: alumnoData, loading: false, error: null, needsSubscription: false });
      return;
    }

    // Check for any subscription that grants access (active, grace period, or pending verification)
    const { data: recentSubs } = await supabase
      .from("suscripciones")
      .select("id, estado, fecha_fin, cancelada_at")
      .eq("alumno_id", alumnoData.id)
      .in("estado", ["activa", "pendiente_verificacion"])
      .is("cancelada_at", null)
      .order("fecha_fin", { ascending: false })
      .limit(10);

    const hasAccess = (recentSubs || []).some((sub: any) => {
      if (sub.estado === "pendiente_verificacion") return true;
      if (sub.estado !== "activa") return false;
      if (!sub.fecha_fin) return true;
      // Parse date parts to avoid timezone drift
      const parts = sub.fecha_fin.substring(0, 10).split("-");
      const finDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (now <= finDate) return true;
      // Grace period: allow up to day 5 of the month after expiry
      const expMonth = finDate.getMonth();
      const expYear = finDate.getFullYear();
      const curMonth = now.getMonth();
      const curYear = now.getFullYear();
      const isNextMonth =
        (curYear === expYear && curMonth === expMonth + 1) ||
        (curYear === expYear + 1 && expMonth === 11 && curMonth === 0);
      return isNextMonth && now.getDate() <= 5;
    });

    if (!hasAccess) {
      setState({ alumno: alumnoData, loading: false, error: null, needsSubscription: true });
      return;
    }

    setState({ alumno: alumnoData, loading: false, error: null, needsSubscription: false });
  }, []);

  useEffect(() => {
    // Impersonation takes precedence over the auth session
    if (isImpersonating && targetAlumno) {
      setState({ alumno: targetAlumno, loading: false, error: null, needsSubscription: false });
      return;
    }

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isImpersonating && targetAlumno) return; // ignore while impersonating
      resolveAlumno(session);
    });

    // Then check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isImpersonating && targetAlumno) return;
      resolveAlumno(session);
    });

    return () => subscription.unsubscribe();
  }, [resolveAlumno, isImpersonating, targetAlumno]);

  const logout = useCallback(async () => {
    if (isImpersonating) return; // never sign out the super admin from an impersonated view
    await supabase.auth.signOut();
    // Clear any legacy localStorage
    localStorage.removeItem("alumno");
    setState({ alumno: null, loading: false, error: null, needsSubscription: false });
  }, [isImpersonating]);

  return { ...state, logout, isImpersonating };
}
