import { useEffect, useState } from "react";
import { useNavigate, Outlet, NavLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Users, Upload, FileSpreadsheet, Dumbbell, LogOut, Menu, X, UserCog, ShieldCheck, Trophy, Package, DollarSign, MapPin, LayoutDashboard, ScrollText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

const navItems = [
  { to: "/admin/resumen", label: "Resumen", icon: LayoutDashboard },
  { to: "/admin/alumnos", label: "Alumnos", icon: Users },
  { to: "/admin/coaches", label: "Coaches", icon: UserCog },
  { to: "/admin/planes", label: "Planes", icon: Package },
  { to: "/admin/precios", label: "Precios", icon: DollarSign },
  { to: "/admin/sedes", label: "Sedes", icon: MapPin },
  { to: "/admin/importar-alumnos", label: "Importar Alumnos", icon: Upload },
  { to: "/admin/importar-plan", label: "Importar Plan", icon: FileSpreadsheet },
  { to: "/admin/entrenamientos", label: "Entrenamientos", icon: Dumbbell },
  { to: "/admin/admins", label: "Admins", icon: ShieldCheck },
  { to: "/admin/eventos/record-de-la-hora", label: "Evento", icon: Trophy },
  { to: "/admin/historial", label: "Historial", icon: ScrollText },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
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

      // Update last_login_at for admin profile
      await supabase
        .from("admin_profiles")
        .update({ last_login_at: new Date().toISOString() } as any)
        .eq("user_id", session.user.id);

      setLoading(false);
    };

    checkAdmin();
  }, [navigate]);

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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar">
        <div className="p-6 border-b border-sidebar-border">
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
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col">
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
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                    isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
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
