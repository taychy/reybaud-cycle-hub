import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { Package, History, LogOut, AlertTriangle, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const DepositoLayout = () => {
  const navigate = useNavigate();

  const navItems = [
    { to: "/deposito/stock", icon: Package, label: "Stock" },
    { to: "/deposito/ventas", icon: ShoppingBag, label: "Ventas" },
    { to: "/deposito/movimientos", icon: History, label: "Movimientos" },
    { to: "/deposito/alertas", icon: AlertTriangle, label: "Alertas" },
    { to: "/deposito/cambios", icon: RefreshCw, label: "Cambios" },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login?returnTo=/deposito", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-3 py-2 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <span className="font-heading font-bold uppercase tracking-wider text-sm">Depósito</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleLogout} aria-label="Cerrar sesión">
          <LogOut className="w-4 h-4" />
        </Button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 border-r border-border bg-card flex-col">
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
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-3 md:p-6 pb-20 md:pb-6 overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span className="leading-none truncate max-w-full px-1">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default DepositoLayout;
