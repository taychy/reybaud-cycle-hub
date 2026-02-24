import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface StudentAuthState {
  alumno: Alumno | null;
  loading: boolean;
  error: string | null;
}

export function useStudentAuth() {
  const [state, setState] = useState<StudentAuthState>({
    alumno: null,
    loading: false,
    error: null,
  });

  const login = useCallback(async (email: string) => {
    setState({ alumno: null, loading: true, error: null });

    const { data, error } = await supabase
      .from("alumnos")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (error) {
      setState({ alumno: null, loading: false, error: "Error al buscar el usuario." });
      return;
    }

    if (!data) {
      setState({ alumno: null, loading: false, error: "No se encontró un usuario con ese email." });
      return;
    }

    if (data.estado === "inactivo") {
      setState({ alumno: null, loading: false, error: "Tu membresía no se encuentra activa. Contactá administración." });
      return;
    }

    if (data.grupo === "Sin grupo") {
      setState({ alumno: null, loading: false, error: "Tu usuario aún no tiene grupo asignado. Contactá administración." });
      return;
    }

    setState({ alumno: data, loading: false, error: null });
  }, []);

  const logout = useCallback(() => {
    setState({ alumno: null, loading: false, error: null });
  }, []);

  return { ...state, login, logout };
}
