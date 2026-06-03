import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { Package, History, LogOut, AlertTriangle, RefreshCw, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const DepositoLayout = () => {
  const navigate = useNavigate();

  const navItems = [
    { to: "/deposito/stock", icon: Package, label: "Stock" },
    { to: "/deposito/pedidos", icon: ShoppingCart, label: "Pedidos" },
    { to: "/deposito/movimientos", icon: History, label: "Movimientos" },
    { to: "/deposito/alertas", icon: AlertTriangle, label: "Alertas" },
    { to: "/deposito/cambios", icon: RefreshCw, label: "Cambios" },
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
              await supabase.auth.signOut();
              navigate("/admin/login?returnTo=/deposito", { replace: true });
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
