import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import StudentDashboard from "@/pages/StudentDashboard";
import type { Tables } from "@/integrations/supabase/types";

type Alumno = Tables<"alumnos">;

/**
 * Wrapper that loads the target alumno, starts impersonation, and renders
 * the real StudentDashboard in read-only mode.
 */
const ImpersonateStudent = () => {
  const { alumnoId } = useParams<{ alumnoId: string }>();
  const navigate = useNavigate();
  const { isImpersonating, startImpersonation } = useImpersonation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alumnoId) {
      navigate("/admin/alumnos");
      return;
    }

    const init = async () => {
      // Verify super_admin
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }

      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      if (profile?.role !== "super_admin") {
        navigate("/admin/alumnos");
        return;
      }

      // Load alumno
      const { data: alumno, error: fetchError } = await supabase
        .from("alumnos")
        .select("*")
        .eq("id", alumnoId)
        .single();

      if (fetchError || !alumno) {
        setError("No se encontró el alumno.");
        setLoading(false);
        return;
      }

      await startImpersonation(alumno as Alumno);
      setLoading(false);
    };

    init();
  }, [alumnoId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando vista del alumno...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  // Render the actual student dashboard — it will detect impersonation via context
  return <StudentDashboard />;
};

export default ImpersonateStudent;
