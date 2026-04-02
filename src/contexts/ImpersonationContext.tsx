import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

interface ImpersonationState {
  isImpersonating: boolean;
  targetAlumno: Alumno | null;
  startedAt: string | null;
}

interface ImpersonationContextValue extends ImpersonationState {
  startImpersonation: (alumno: Alumno) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  isImpersonating: false,
  targetAlumno: null,
  startedAt: null,
  startImpersonation: async () => {},
  stopImpersonation: async () => {},
});

export const useImpersonation = () => useContext(ImpersonationContext);

export const ImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ImpersonationState>({
    isImpersonating: false,
    targetAlumno: null,
    startedAt: null,
  });

  const startImpersonation = useCallback(async (alumno: Alumno) => {
    const startedAt = new Date().toISOString();
    // Audit log
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("audit_log").insert({
        user_id: session.user.id,
        user_email: session.user.email,
        user_role: "super_admin",
        action: "impersonation_start",
        entity_type: "alumno",
        entity_id: alumno.id,
        details: { alumno_nombre: alumno.nombre, alumno_email: alumno.email },
      } as any);
    }
    setState({ isImpersonating: true, targetAlumno: alumno, startedAt });
  }, []);

  const stopImpersonation = useCallback(async () => {
    const { targetAlumno, startedAt } = state;
    // Audit log
    const { data: { session } } = await supabase.auth.getSession();
    if (session && targetAlumno) {
      await supabase.from("audit_log").insert({
        user_id: session.user.id,
        user_email: session.user.email,
        user_role: "super_admin",
        action: "impersonation_end",
        entity_type: "alumno",
        entity_id: targetAlumno.id,
        details: {
          alumno_nombre: targetAlumno.nombre,
          alumno_email: targetAlumno.email,
          started_at: startedAt,
          ended_at: new Date().toISOString(),
        },
      } as any);
    }
    setState({ isImpersonating: false, targetAlumno: null, startedAt: null });
  }, [state]);

  return (
    <ImpersonationContext.Provider value={{ ...state, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
};
