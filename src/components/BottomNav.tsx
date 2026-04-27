import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

const tabToPath: Record<Tab, string> = {
  hoy: "/alumno",
  eventos: "/alumno/eventos",
  tienda: "/alumno/tienda",
  progreso: "/alumno/progreso",
  mas: "/alumno/mas",
};

const pathToTab = (pathname: string): Tab => {
  if (pathname.startsWith("/alumno/eventos")) return "eventos";
  if (pathname.startsWith("/alumno/tienda")) return "tienda";
  if (pathname.startsWith("/alumno/progreso")) return "progreso";
  if (pathname.startsWith("/alumno/mas")) return "mas";
  return "hoy";
};

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // Active tab is derived from URL when no explicit prop is provided.
  const currentTab: Tab = activeTab ?? pathToTab(location.pathname);

  const handleTab = (tab: Tab) => {
    if (onTabChange) {
      onTabChange(tab);
      return;
    }
    const target = tabToPath[tab];
    if (location.pathname !== target) navigate(target);
  };

  return (
    <nav className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur-md z-30">
      <div className="max-w-md mx-auto flex items-center justify-around py-2 relative">
        <NavItem
          icon={<Home className="w-5 h-5" />}
          label={t("nav.home")}
          active={activeTab === "hoy"}
          onClick={() => handleTab("hoy")}
        />
        <NavItem
          icon={<Trophy className="w-5 h-5" />}
          label={t("nav.events")}
          active={activeTab === "eventos"}
          onClick={() => handleTab("eventos")}
        />
        <NavItem
          icon={<ShoppingCart className="w-5 h-5" />}
          label={t("nav.store", "Tienda")}
          active={activeTab === "tienda"}
          onClick={() => handleTab("tienda")}
        />
        <NavItem
          icon={<TrendingUp className="w-5 h-5" />}
          label={t("nav.progress")}
          active={activeTab === "progreso"}
          onClick={() => handleTab("progreso")}
        />
        <NavItem
          icon={<MoreHorizontal className="w-5 h-5" />}
          label={t("nav.more")}
          active={activeTab === "mas"}
          onClick={() => handleTab("mas")}
        />
      </div>
    </nav>
  );
};

export default BottomNav;
