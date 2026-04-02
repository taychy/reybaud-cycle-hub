import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useNavigate } from "react-router-dom";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const estadoBadge = (estado: string) => {
  switch (estado) {
    case "activo": return "bg-emerald-600/20 text-emerald-400 border-emerald-500/30";
    case "inactivo": return "text-muted-foreground";
    case "bloqueado": return "bg-destructive/20 text-destructive border-destructive/30";
    case "vacaciones": return "border-blue-500/50 text-blue-400";
    case "pendiente": return "border-yellow-500/50 text-yellow-400";
    default: return "";
  }
};

const ImpersonationBanner = () => {
  const { isImpersonating, targetAlumno, stopImpersonation } = useImpersonation();
  const navigate = useNavigate();

  if (!isImpersonating || !targetAlumno) return null;

  const handleExit = async () => {
    await stopImpersonation();
    navigate("/admin/alumnos");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 shadow-lg">
      <div className="flex items-center gap-3 min-w-0">
        <Eye className="w-5 h-5 shrink-0" />
        <span className="text-sm font-semibold truncate">
          Estás viendo la cuenta de{" "}
          <strong>{targetAlumno.nombre} {(targetAlumno as any).apellido || ""}</strong>{" "}
          como super admin
        </span>
        <Badge variant="outline" className={`shrink-0 text-xs border ${estadoBadge(targetAlumno.estado)}`}>
          {targetAlumno.estado}
        </Badge>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleExit}
        className="shrink-0 bg-amber-600/30 border-amber-700 text-amber-950 hover:bg-amber-600/50"
      >
        <X className="w-4 h-4 mr-1" />
        Salir de esta vista
      </Button>
    </div>
  );
};

export default ImpersonationBanner;
