import { useEffect, useMemo, useState } from "react";
import { useNavigate, Outlet, NavLink, useLocation, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Users, Dumbbell, LogOut, Menu, X, UserCog, ShieldCheck, Trophy, Package, DollarSign, MapPin, LayoutDashboard, ScrollText, Receipt, ShoppingCart, Tag, Image, BarChart3, Boxes, FileText, TrendingUp, Wallet, CalendarClock, Banknote, MessageCircle, Megaphone, RefreshCw, Truck, GraduationCap, Workflow, BellRing, ClipboardList, ChevronDown, Settings, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import logo from "@/assets/logo.png";
import SwitchPortalButton from "@/components/SwitchPortalButton";
import { setPrevSeen } from "@/lib/adminNovelty";


/* ─── Nav structure ─── */
type BadgeKey = "waitlist" | "waitlist_entries" | "turnera";
/** Secciones con "pelotita" de novedad (contenido nuevo desde la última visita) */
type NoveltyKey = "alumnos" | "eventos" | "tienda_ventas" | "pedidos_proveedor" | "cobros_entrega" | "cambios_plan";
type NavItem = { to: string; label: string; icon: any; badgeKey?: BadgeKey; noveltyKey?: NoveltyKey; superAdmin?: boolean };
type NavGroup = { label: string; items: NavItem[] };
type NavModule = { key: string; label: string; icon: any; groups: NavGroup[] };


const modules: NavModule[] = [
  {
    key: "academia",
    label: "Academia",
    icon: GraduationCap,
    groups: [
      {
        label: "Principal",
        items: [
          { to: "/admin/resumen", label: "Resumen", icon: LayoutDashboard },
          { to: "/admin/metricas", label: "Métricas", icon: TrendingUp, superAdmin: true },
        ],
      },
      {
        label: "Personas",
        items: [
          { to: "/admin/alumnos", label: "Alumnos", icon: Users, noveltyKey: "alumnos" },
          { to: "/admin/coaches", label: "Coaches", icon: UserCog },
          // { to: "/admin/asesoria", label: "Asesoría", icon: UserCog }, // oculto: sin uso operativo real
          { to: "/admin/solicitudes-cambio-plan", label: "Solicitudes cambio plan", icon: RefreshCw, noveltyKey: "cambios_plan" },
        ],
      },
      {
        label: "Admisiones",
        items: [
          { to: "/admin/eventos", label: "Eventos", icon: Trophy, noveltyKey: "eventos" },
          { to: "/admin/solicitudes-alojamiento", label: "Solicitudes alojamiento", icon: BellRing, badgeKey: "waitlist" },
          { to: "/admin/waitlist-plantillas", label: "Plantillas waitlist", icon: ClipboardList, badgeKey: "waitlist_entries" },
          { to: "/admin/procesos", label: "Procesos", icon: Workflow },
        ],
      },
      {
        label: "Comunicación",
        items: [
          { to: "/admin/whatsapp-conciliador", label: "WhatsApp", icon: MessageCircle },
          { to: "/admin/comunicaciones", label: "Plantillas email", icon: Megaphone },
          { to: "/admin/email-masivo", label: "Email masivo", icon: Megaphone },
        ],
      },
      {
        label: "Entrenamiento",
        items: [
          { to: "/admin/entrenamientos", label: "Entrenamientos", icon: Dumbbell },
          { to: "/admin/programas", label: "Programas", icon: GraduationCap },
          { to: "/admin/turnera", label: "Turnera", icon: CalendarClock, badgeKey: "turnera" },
        ],
      },
    ],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    icon: Wallet,
    groups: [
      {
        label: "Cobros",
        items: [
          { to: "/admin/pagos", label: "Pagos", icon: Receipt },
          { to: "/admin/cierre-caja", label: "Cierre de caja", icon: Wallet },
          { to: "/admin/cuenta-corriente", label: "Cuenta corriente", icon: Wallet },
          { to: "/admin/cobros-entrega", label: "Cobros de entrega", icon: Truck, noveltyKey: "cobros_entrega" },
        ],
      },
      {
        label: "Precios",
        items: [
          { to: "/admin/planes", label: "Planes", icon: Package },
          { to: "/admin/descuentos", label: "Descuentos", icon: Tag },
          { to: "/admin/precios", label: "Precios", icon: DollarSign },
        ],
      },
      {
        label: "Contabilidad",
        items: [
          { to: "/admin/facturacion", label: "Facturación", icon: FileText },
          // { to: "/admin/liquidaciones", label: "Liquidaciones", icon: Banknote }, // oculto: sin uso operativo real
          { to: "/admin/gastos", label: "Gastos", icon: Wallet, superAdmin: true },
        ],
      },
    ],
  },
  {
    key: "tienda",
    label: "Tienda",
    icon: ShoppingCart,
    groups: [
      {
        label: "General",
        items: [
          { to: "/admin/tienda", label: "Dashboard", icon: LayoutDashboard },
          { to: "/admin/tienda/analytics", label: "Analytics", icon: BarChart3 },
        ],
      },
      {
        label: "Catálogo",
        items: [
          { to: "/admin/tienda/productos", label: "Productos", icon: ShoppingCart },
          { to: "/admin/tienda/categorias", label: "Categorías", icon: Tag },
          { to: "/admin/tienda/stock", label: "Stock", icon: Package },
          { to: "/admin/tienda/promociones", label: "Promociones", icon: Tag },
          // { to: "/admin/tienda/banners", label: "Banners", icon: Image }, // oculto: sin uso operativo real
        ],
      },
      {
        label: "Operación",
        items: [
          { to: "/admin/tienda/ventas", label: "Ventas", icon: Boxes, noveltyKey: "tienda_ventas" },
          { to: "/admin/tienda/pedidos-proveedor", label: "Pedidos a Proveedor", icon: Truck, noveltyKey: "pedidos_proveedor" },
          { to: "/admin/tienda/proveedores", label: "Proveedores", icon: Truck },
          { to: "/admin/tienda/control-mercaderia", label: "Control de Mercadería", icon: AlertTriangle },
          
          { to: "/admin/entregas-caja", label: "Entregas / Caja", icon: Truck },
        ],
      },
    ],
  },
  {
    key: "config",
    label: "Configuración",
    icon: Settings,
    groups: [
      {
        label: "Configuración",
        items: [
          { to: "/admin/sedes", label: "Sedes", icon: MapPin },
          
          { to: "/admin/admins", label: "Admins", icon: ShieldCheck },
          { to: "/admin/historial", label: "Historial", icon: ScrollText },
        ],
      },
    ],
  },
];

const findModuleKeyForPath = (pathname: string): string => {
  for (const m of modules) {
    for (const g of m.groups) {
      if (g.items.some((it) => pathname.startsWith(it.to))) return m.key;
    }
  }
  return "academia";
};

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDeposito, setIsDeposito] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("admin_sidebar_collapsed") === "true";
  });
  const [openModule, setOpenModule] = useState<string>(() => {
    return localStorage.getItem("admin_sidebar_open_module") || findModuleKeyForPath(location.pathname);
  });
  const [waitlistPending, setWaitlistPending] = useState(0);
  const [waitlistEntriesPending, setWaitlistEntriesPending] = useState(0);
  const [turneraPending, setTurneraPending] = useState(0);
  const [novedades, setNovedades] = useState<Record<string, number>>({});

  useEffect(() => {
    const key = findModuleKeyForPath(location.pathname);
    setOpenModule(key);
    localStorage.setItem("admin_sidebar_open_module", key);
  }, [location.pathname]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [{ data: pending }, { data: newEntries }, { data: newTurnera }, { data: nov }] = await Promise.all([
        supabase.rpc("count_pending_waitlist_requests" as any),
        supabase.rpc("count_new_waitlist_entries" as any),
        supabase.rpc("count_new_turnera_reservations" as any),
        supabase.rpc("count_admin_novedades" as any),
      ]);
      if (alive) {
        setWaitlistPending(Number(pending ?? 0));
        setWaitlistEntriesPending(Number(newEntries ?? 0));
        setTurneraPending(Number(newTurnera ?? 0));
        setNovedades((nov as any) || {});
      }
    };
    load();
    const iv = setInterval(load, 60000);
    const onRefresh = () => { if (alive) load(); };
    window.addEventListener("reybaud:refresh-admin-badges", onRefresh);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("reybaud:refresh-admin-badges", onRefresh);
    };
  }, [location.pathname]);

  // Al entrar a una sección con novedades, la marcamos como vista
  useEffect(() => {
    const item = modules
      .flatMap((m) => m.groups.flatMap((g) => g.items))
      .filter((it) => it.noveltyKey && location.pathname.startsWith(it.to))
      .sort((a, b) => b.to.length - a.to.length)[0];
    if (!item?.noveltyKey) return;
    const key = item.noveltyKey;
    let cancelled = false;
    (async () => {
      // Guardamos la marca anterior para poder resaltar filas nuevas dentro de la sección
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: seen } = await supabase
          .from("admin_section_seen")
          .select("seen_at")
          .eq("user_id", session.user.id)
          .eq("section_key", key)
          .maybeSingle();
        setPrevSeen(key, (seen as any)?.seen_at ?? null);
      }
      if (cancelled) return;
      await supabase.rpc("mark_admin_section_seen" as any, { p_section_key: key });
      if (!cancelled) setNovedades((prev) => ({ ...prev, [key]: 0 }));
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);



  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("admin_sidebar_collapsed", String(next));
  };

  const selectModule = (key: string) => {
    setOpenModule(key);
    localStorage.setItem("admin_sidebar_open_module", key);
  };

  useEffect(() => {
    let isMounted = true;
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      const [{ data: isAdmin }, { data: isDepo }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: session.user.id, _role: "deposito" as any }),
      ]);

      if (!isAdmin && !isDepo) {
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

      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (isMounted) {
        if (profile?.role === "super_admin") setIsSuperAdmin(true);
        if (!isAdmin && (profile?.role === "deposito" || isDepo)) setIsDeposito(true);
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

  const visibleModules = useMemo(() => {
    let mods = isDeposito ? modules.filter((m) => m.key === "tienda") : modules;
    // Filter super-admin-only items
    return mods
      .map((m) => ({
        ...m,
        groups: m.groups
          .map((g) => ({
            ...g,
            items: g.items.filter((it) => !it.superAdmin || isSuperAdmin),
          }))
          .filter((g) => g.items.length > 0),
      }))
      .filter((m) => m.groups.length > 0);
  }, [isDeposito, isSuperAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (isDeposito && !location.pathname.startsWith("/admin/tienda")) {
    return <Navigate to="/admin/tienda" replace />;
  }


  const badgeCountFor = (key?: BadgeKey) =>
    key === "waitlist" ? waitlistPending :
    key === "waitlist_entries" ? waitlistEntriesPending :
    key === "turnera" ? turneraPending : 0;

  const noveltyCountFor = (key?: NoveltyKey) => (key ? Number(novedades[key] ?? 0) : 0);

  const moduleBadgeCount = (m: NavModule) =>
    m.groups.reduce((acc, g) => acc + g.items.reduce((a, it) => a + badgeCountFor(it.badgeKey), 0), 0);

  const moduleNoveltyCount = (m: NavModule) =>
    m.groups.reduce((acc, g) => acc + g.items.reduce((a, it) => a + noveltyCountFor(it.noveltyKey), 0), 0);

  const NoveltyDot = ({ count, className = "" }: { count: number; className?: string }) => (
    <span
      title={`${count} novedad${count === 1 ? "" : "es"}`}
      className={`inline-block w-2 h-2 rounded-full bg-destructive shadow-[0_0_0_2px_hsl(var(--sidebar-background))] animate-pulse ${className}`}
    />
  );

  const NavItemRow = ({ item, mobile = false }: { item: NavItem; mobile?: boolean }) => {
    const iconSize = mobile ? "w-5 h-5" : "w-4 h-4";
    const py = mobile ? "py-3" : "py-2";
    const badgeCount = badgeCountFor(item.badgeKey);
    const novelty = noveltyCountFor(item.noveltyKey);

    if (collapsed && !mobile) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <NavLink
              to={item.to}
              end={item.to === "/admin/tienda"}
              className={({ isActive }) =>
                `relative flex items-center justify-center p-2.5 rounded-md transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`
              }
            >
              <item.icon className={iconSize} />
              {badgeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
              {badgeCount === 0 && novelty > 0 && (
                <NoveltyDot count={novelty} className="absolute top-1 right-1" />
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}{badgeCount > 0 ? ` (${badgeCount})` : novelty > 0 ? ` — ${novelty} nuevo${novelty === 1 ? "" : "s"}` : ""}
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
          `flex items-center gap-3 pl-6 pr-3 ${py} rounded-md text-sm font-medium transition-colors ${
            isActive
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          }`
        }
      >
        <item.icon className={iconSize} />
        <span className="flex-1 flex items-center gap-2">
          {item.label}
          {novelty > 0 && <NoveltyDot count={novelty} />}
        </span>
        {badgeCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </NavLink>
    );
  };

  const renderModules = (mobile: boolean) => (
    <div className="space-y-1">
      {visibleModules.map((m) => {
        const isOpen = openModule === m.key;
        const badge = moduleBadgeCount(m);
        const moduleNovelty = moduleNoveltyCount(m);
        const Icon = m.icon;

        if (collapsed && !mobile) {
          // In collapsed desktop: flat list of items grouped by module divider
          return (
            <div key={m.key} className="pt-2">
              <div className="border-t border-sidebar-border mx-1 mb-1" />
              {m.groups.flatMap((g) => g.items).map((item) => (
                <NavItemRow key={item.to} item={item} />
              ))}
            </div>
          );
        }

        return (
          <div key={m.key}>
            <button
              onClick={() => selectModule(isOpen ? "" : m.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-heading font-bold uppercase tracking-wider transition-colors ${
                isOpen
                  ? "text-sidebar-primary bg-sidebar-accent/30"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <Icon className={mobile ? "w-5 h-5" : "w-4 h-4"} />
              <span className="flex-1 text-left flex items-center gap-2">
                {m.label}
                {!isOpen && moduleNovelty > 0 && <NoveltyDot count={moduleNovelty} />}
              </span>
              {badge > 0 && !isOpen && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div className="mt-1 mb-2 space-y-2">
                {m.groups.map((g, gi) => (
                  <div key={g.label} className={gi > 0 ? "pt-1" : ""}>
                    {m.groups.length > 1 && (
                      <div className="px-3 pb-1 pt-1 text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground">
                        {g.label}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {g.items.map((item) => (
                        <NavItemRow key={item.to} item={item} mobile={mobile} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - desktop */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 ${
          collapsed ? "w-[60px]" : "w-64"
        }`}
      >
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

        <nav className={`flex-1 ${collapsed ? "p-1.5" : "p-3"} overflow-y-auto`}>
          {renderModules(false)}

          <div className="pt-4 space-y-1">
            {!collapsed && <SwitchPortalButton fullWidth />}
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

      {/* Mobile */}
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

        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60 animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
        )}

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

          <nav className="flex-1 p-3 overflow-y-auto">
            {renderModules(true)}
          </nav>

          <div className="p-3 border-t border-sidebar-border space-y-1">
            <SwitchPortalButton fullWidth onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="flex-1 p-6 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
