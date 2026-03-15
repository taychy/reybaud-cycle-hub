import { useEffect } from "react";
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useDepositoAuth } from "@/hooks/useDepositoAuth";
import { Package, BarChart3, History, LogOut, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const DepositoLayout = () => {
  const { user, isDeposito, loading, logout } = useDepositoAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !isDeposito)) {
      navigate("/deposito/login");
    }
  }, [user, isDeposito, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user || !isDeposito) return null;

  const navItems = [
    { to: "/deposito/stock", icon: Package, label: "Stock" },
    { to: "/deposito/movimientos", icon: History, label: "Movimientos" },
    { to: "/deposito/alertas", icon: AlertTriangle, label: "Alertas" },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <span className="font-heading font-bold uppercase tracking-wider text-sm">Depósito</span>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={async () => {
              await logout();
              navigate("/deposito/login");
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default DepositoLayout;
