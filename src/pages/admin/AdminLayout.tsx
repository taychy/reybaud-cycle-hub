import { useEffect, useState } from "react";
import { useNavigate, Outlet, NavLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Users, Dumbbell, LogOut, Menu, X, UserCog, ShieldCheck, Trophy, Package, DollarSign, MapPin, LayoutDashboard, ScrollText, Receipt, ShoppingCart, Tag, Image, BarChart3, Boxes, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import logo from "@/assets/logo.png";

const navItems = [
  { to: "/admin/resumen", label: "Resumen", icon: LayoutDashboard },
  { to: "/admin/alumnos", label: "Alumnos", icon: Users },
  { to: "/admin/coaches", label: "Coaches", icon: UserCog },
  { to: "/admin/planes", label: "Planes", icon: Package },
  { to: "/admin/precios", label: "Precios", icon: DollarSign },
  { to: "/admin/pagos", label: "Pagos", icon: Receipt },
  { to: "/admin/sedes", label: "Sedes", icon: MapPin },
  { to: "/admin/entrenamientos", label: "Entrenamientos", icon: Dumbbell },
  { to: "/admin/admins", label: "Admins", icon: ShieldCheck },
  { to: "/admin/eventos/record-de-la-hora", label: "Evento", icon: Trophy },
  { to: "/admin/historial", label: "Historial", icon: ScrollText },
];

const storeNavItems = [
  { to: "/admin/tienda", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/tienda/productos", label: "Productos", icon: ShoppingCart },
  { to: "/admin/tienda/categorias", label: "Categorías", icon: Tag },
  { to: "/admin/tienda/pedidos", label: "Pedidos", icon: Boxes },
  { to: "/admin/tienda/promociones", label: "Promociones", icon: Tag },
  { to: "/admin/tienda/banners", label: "Banners", icon: Image },
  { to: "/admin/tienda/stock", label: "Stock", icon: Package },
  { to: "/admin/tienda/analytics", label: "Analytics", icon: BarChart3 },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("admin_sidebar_collapsed") === "true";
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("admin_sidebar_collapsed", String(next));
  };

  useEffect(() => {
    let isMounted = true;
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });

      if (!isAdmin) {
        await supabase.auth.signOut();
        navigate("/admin/login");
        return;
      }

      const alreadyUpdated = sessionStorage.getItem("admin_login_updated");
      if (!alreadyUpdated) {
        await supabase
          .from("admin_profiles")
          .update({ last_login_at: new Date().toISOString() } as any)
          .eq("user_id", session.user.id);
        sessionStorage.setItem("admin_login_updated", "true");
      }

      if (isMounted) setLoading(false);
    };

    checkAdmin();
    return () => { isMounted = false; };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  const NavItem = ({ item, mobile = false }: { item: typeof navItems[0]; mobile?: boolean }) => {
    const iconSize = mobile ? "w-5 h-5" : "w-4 h-4";
    const py = mobile ? "py-3" : "py-2.5";

    if (collapsed && !mobile) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <NavLink
              to={item.to}
              end={item.to === "/admin/tienda"}
              className={({ isActive }) =>
                `flex items-center justify-center p-2.5 rounded-md transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`
              }
            >
              <item.icon className={iconSize} />
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <NavLink
        to={item.to}
        end={item.to === "/admin/tienda"}
        onClick={mobile ? () => setMobileOpen(false) : undefined}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 ${py} rounded-md text-sm font-medium transition-colors ${
            isActive
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          }`
        }
      >
        <item.icon className={iconSize} />
        {item.label}
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - desktop */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 ${
          collapsed ? "w-[60px]" : "w-64"
        }`}
      >
        {/* Header with hamburger toggle */}
        <div className={`border-b border-sidebar-border ${collapsed ? "p-3" : "px-4 py-3"}`}>
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
            <button
              onClick={toggleCollapsed}
              className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors shrink-0"
              title={collapsed ? "Expandir menú" : "Colapsar menú"}
            >
              <Menu className="w-5 h-5" />
            </button>
            {!collapsed && (
              <>
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                  <img src={logo} alt="Ciclismo Reybaud" className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-sm font-heading font-bold uppercase tracking-wider text-sidebar-foreground">
                    Reybaud
                  </h1>
                  <p className="text-xs text-muted-foreground">Admin Panel</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className={`flex-1 ${collapsed ? "p-1.5" : "p-3"} space-y-1 overflow-y-auto`}>
          {navItems.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}

          {/* Store section */}
          <div className="pt-4 pb-1">
            {!collapsed && (
              <span className="px-3 text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground">
                Tienda
              </span>
            )}
            {collapsed && <div className="border-t border-sidebar-border mx-1" />}
          </div>
          {storeNavItems.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}

          {/* Logout inside nav */}
          <div className="pt-4">
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="flex items-center justify-center p-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Cerrar sesión
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            )}
          </div>
        </nav>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden">
              <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
            </div>
            <span className="font-heading font-bold uppercase text-sm tracking-wider">Reybaud Admin</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </header>

        {/* Mobile drawer overlay */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60 animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Mobile drawer */}
        <aside
          className={`md:hidden fixed top-0 left-0 z-50 h-full w-[80%] max-w-xs bg-sidebar border-r border-border flex flex-col transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img src={logo} alt="Ciclismo Reybaud" className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-sm font-heading font-bold uppercase tracking-wider text-sidebar-foreground">
                  Reybaud
                </h1>
                <p className="text-xs text-muted-foreground">Admin Panel</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavItem key={item.to} item={item} mobile />
            ))}
            <div className="pt-4 pb-1">
              <span className="px-3 text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground">Tienda</span>
            </div>
            {storeNavItems.map((item) => (
              <NavItem key={item.to} item={item} mobile />
            ))}
          </nav>

          <div className="p-3 border-t border-sidebar-border">
            <button
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 p-6 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
