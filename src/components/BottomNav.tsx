import { useNavigate } from "react-router-dom";
import { Home, Trophy, ShoppingCart, TrendingUp, MoreHorizontal } from "lucide-react";

type Tab = "hoy" | "eventos" | "tienda" | "progreso" | "mas";

interface BottomNavProps {
  activeTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

const NavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
    {icon}
    <span className="text-[10px] font-heading font-medium">{label}</span>
  </button>
);

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const navigate = useNavigate();

  const handleTab = (tab: Tab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      // Navigate to dashboard with tab state
      navigate("/alumno", { state: { tab } });
    }
  };

  return (
    <nav className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur-md z-30">
      <div className="max-w-md mx-auto flex items-center justify-around py-2 relative">
        <NavItem
          icon={<Home className="w-5 h-5" />}
          label="Inicio"
          active={activeTab === "hoy"}
          onClick={() => handleTab("hoy")}
        />
        <NavItem
          icon={<Trophy className="w-5 h-5" />}
          label="Eventos"
          active={activeTab === "eventos"}
          onClick={() => handleTab("eventos")}
        />
        <button
          onClick={() => handleTab("tienda")}
          className="flex flex-col items-center gap-0.5 -mt-5"
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
            activeTab === "tienda"
              ? "bg-primary text-primary-foreground shadow-primary/40"
              : "bg-primary/90 text-primary-foreground shadow-primary/30 hover:bg-primary"
          }`}>
            <ShoppingCart className="w-5 h-5" />
          </div>
          <span className={`text-[10px] font-heading font-medium ${activeTab === "tienda" ? "text-primary" : "text-muted-foreground"}`}>Tienda</span>
        </button>
        <NavItem
          icon={<TrendingUp className="w-5 h-5" />}
          label="Progreso"
          active={activeTab === "progreso"}
          onClick={() => handleTab("progreso")}
        />
        <NavItem
          icon={<MoreHorizontal className="w-5 h-5" />}
          label="Más"
          active={activeTab === "mas"}
          onClick={() => handleTab("mas")}
        />
      </div>
    </nav>
  );
};

export default BottomNav;
