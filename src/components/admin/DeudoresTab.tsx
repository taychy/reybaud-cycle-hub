import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Search, RefreshCw, MessageCircle, ChevronDown, ChevronRight, Wallet,
  CalendarClock, CheckCircle2, PhoneCall, AlertTriangle, Download,
} from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { waLink } from "@/lib/whatsappReminderTemplates";
import { toast } from "sonner";
import { PeriodBadge } from "@/components/admin/PeriodBadge";

interface DeudaRow {
  alumno_id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  grupo: string | null;
  sede_id: string | null;
  estado_alumno: string | null;
  moneda: string;
  fuente_tabla: string;
  fuente_id: string;
  concepto: string;
  fecha: string;
  dias_mora: number;
  saldo_item: number;
  credito_disponible: number;
}

interface GestionTarea {
  id: string;
  estado: string;
  pospuesta_hasta: string | null;
  nota_cierre: string | null;
  updated_at: string;
  dedupe_key: string | null;
  metadata: any;
}

type GestionEstado = "pendiente" | "contactado" | "promesa" | "cobrado";

const ORIGEN_LABEL: Record<string, string> = {
  suscripciones: "Mensualidad",
  event_reservations: "Evento",
  store_orders: "Tienda",
  store_preorders: "Preventa",
  cuenta_ajustes: "Cargo manual",
};

const ORIGEN_TONE: Record<string, string> = {
  suscripciones: "bg-primary/15 text-primary border-primary/30",
  event_reservations: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  store_orders: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  store_preorders: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  cuenta_ajustes: "bg-muted text-muted-foreground border-border",
};

const GESTION_LABEL: Record<GestionEstado, string> = {
  pendiente: "Sin gestionar",
  contactado: "Contactado",
  promesa: "Promesa de pago",
  cobrado: "Cobrado",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const p = d.substring(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function moraTone(d: number): string {
  if (d > 30) return "bg-destructive/15 text-destructive border-destructive/30";
  if (d > 7) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

/** Estado de gestión derivado de la tarea guardada. */
function gestionFromTarea(t: GestionTarea | undefined): GestionEstado {
  if (!t) return "pendiente";
  if (t.estado === "hecha") return "cobrado";
  if (t.estado === "pospuesta" && t.pospuesta_hasta) return "promesa";
  if (t.estado === "en_curso") return "contactado";
  return "pendiente";
}

export default function DeudoresTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DeudaRow[]>([]);
  const [tareas, setTareas] = useState<Record<string, GestionTarea>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState("");
  const [monedaFilter, setMonedaFilter] = useState("all");
  const [origenFilter, setOrigenFilter] = useState("all");
  const [moraFilter, setMoraFilter] = useState("all");
  const [gestionFilter, setGestionFilter] = useState("abiertas");

  const [gestionDialog, setGestionDialog] = useState<{ key: string; nombre: string } | null>(null);
  const [gestionEstado, setGestionEstado] = useState<GestionEstado>("contactado");
  const [gestionFecha, setGestionFecha] = useState("");
  const [gestionNota, setGestionNota] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [deudasRes, tareasRes] = await Promise.all([
      supabase.rpc("get_deudores_cobranzas" as any),
      supabase
        .from("tareas")
        .select("id, estado, pospuesta_hasta, nota_cierre, updated_at, dedupe_key, metadata")
        .eq("entidad_tipo", "cobranza"),
    ]);
    if (deudasRes.error) {
      console.error(deudasRes.error);
      toast.error("No se pudieron cargar las cobranzas");
    } else {
      setRows(((deudasRes.data || []) as any[]).map((r) => ({
        ...r,
        saldo_item: Number(r.saldo_item) || 0,
        credito_disponible: Number(r.credito_disponible) || 0,
        dias_mora: Number(r.dias_mora) || 0,
      })) as DeudaRow[]);
    }
    const map: Record<string, GestionTarea> = {};
    for (const t of ((tareasRes.data || []) as any[])) {
      if (t.dedupe_key) map[t.dedupe_key] = t as GestionTarea;
    }
    setTareas(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monedas = useMemo(
    () => Array.from(new Set(rows.map((r) => r.moneda))).sort(),
    [rows],
  );

  /** Una fila por alumno + moneda, con las deudas individuales adentro. */
  const grupos = useMemo(() => {
    const q = search.trim().toLowerCase();
    const acc: Record<string, {
      key: string;
      alumno: DeudaRow;
      items: DeudaRow[];
      total: number;
      maxMora: number;
      origenes: Set<string>;
    }> = {};

    for (const r of rows) {
      if (monedaFilter !== "all" && r.moneda !== monedaFilter) continue;
      if (origenFilter !== "all" && r.fuente_tabla !== origenFilter) continue;
      if (moraFilter === "1_7" && (r.dias_mora < 1 || r.dias_mora > 7)) continue;
      if (moraFilter === "8_30" && (r.dias_mora < 8 || r.dias_mora > 30)) continue;
      if (moraFilter === "31" && r.dias_mora <= 30) continue;
      if (q) {
        const hay = `${r.nombre} ${r.apellido || ""} ${r.email || ""} ${r.telefono || ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const key = `${r.alumno_id}:${r.moneda}`;
      if (!acc[key]) acc[key] = { key, alumno: r, items: [], total: 0, maxMora: 0, origenes: new Set() };
      acc[key].items.push(r);
      acc[key].total += r.saldo_item;
      acc[key].maxMora = Math.max(acc[key].maxMora, r.dias_mora);
      acc[key].origenes.add(r.fuente_tabla);
    }

    let list = Object.values(acc).map((g) => {
      const t = tareas[g.key];
      const gestion = gestionFromTarea(t);
      const promesaVencida =
        gestion === "promesa" && !!t?.pospuesta_hasta && t.pospuesta_hasta < todayISO();
      return { ...g, tarea: t, gestion, promesaVencida };
    });

    if (gestionFilter === "abiertas") list = list.filter((g) => g.gestion !== "cobrado");
    else if (gestionFilter !== "all") list = list.filter((g) => g.gestion === gestionFilter);

    // Prioridad: promesas vencidas primero, luego mora × monto.
    return list.sort((a, b) => {
      if (a.promesaVencida !== b.promesaVencida) return a.promesaVencida ? -1 : 1;
      const sa = a.maxMora * a.total;
      const sb = b.maxMora * b.total;
      return sb - sa;
    });
  }, [rows, search, monedaFilter, origenFilter, moraFilter, gestionFilter, tareas]);

  const kpis = useMemo(() => {
    const porMoneda: Record<string, number> = {};
    let promesasVencidas = 0;
    let sinGestionar = 0;
    grupos.forEach((g) => {
      porMoneda[g.alumno.moneda] = (porMoneda[g.alumno.moneda] || 0) + g.total;
      if (g.promesaVencida) promesasVencidas++;
      if (g.gestion === "pendiente") sinGestionar++;
    });
    return { porMoneda, promesasVencidas, sinGestionar, cobranzas: grupos.length };
  }, [grupos]);

  const buildWaMessage = (g: (typeof grupos)[number]) => {
    const nombre = g.alumno.nombre;
    const detalle = g.items
      .map((i) => `• ${ORIGEN_LABEL[i.fuente_tabla] || "Concepto"}: ${i.concepto} — ${formatPrice(i.saldo_item, i.moneda)}`)
      .join("\n");
    const total = formatPrice(g.total, g.alumno.moneda);
    const credito = g.alumno.credito_disponible > 0.01
      ? `\n\nTenés un saldo a favor de ${formatPrice(g.alumno.credito_disponible, g.alumno.moneda)} que podemos aplicar.`
      : "";
    if (g.maxMora > 30) {
      return `Hola ${nombre}, ¿cómo estás? Te escribo por tu cuenta con nosotros, quedó pendiente:\n\n${detalle}\n\nTotal: ${total}. Hace tiempo que viene demorado, ¿lo resolvemos juntos? Contame cómo te queda mejor.${credito}`;
    }
    return `Hola ${nombre}, ¿cómo va? Te paso el detalle de lo que figura pendiente:\n\n${detalle}\n\nTotal: ${total}. Cualquier duda avisame y lo vemos. ¡Gracias! 🚴${credito}`;
  };

  const openGestion = (g: (typeof grupos)[number]) => {
    const current = g.gestion === "pendiente" ? "contactado" : g.gestion;
    setGestionEstado(current as GestionEstado);
    setGestionFecha(g.tarea?.pospuesta_hasta || "");
    setGestionNota(g.tarea?.nota_cierre || "");
    setGestionDialog({ key: g.key, nombre: `${g.alumno.nombre} ${g.alumno.apellido || ""}`.trim() });
  };

  const saveGestion = async () => {
    if (!gestionDialog) return;
    if (gestionEstado === "promesa" && !gestionFecha) {
      toast.error("Indicá la fecha comprometida de pago");
      return;
    }
    setSaving(true);
    const key = gestionDialog.key;
    const existing = tareas[key];
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id || null;

    const estadoTarea =
      gestionEstado === "cobrado" ? "hecha"
        : gestionEstado === "promesa" ? "pospuesta"
        : gestionEstado === "contactado" ? "en_curso"
        : "pendiente";

    const payload: any = {
      estado: estadoTarea,
      pospuesta_hasta: gestionEstado === "promesa" ? gestionFecha : null,
      nota_cierre: gestionNota || null,
      cerrada_por: gestionEstado === "cobrado" ? uid : null,
      cerrada_at: gestionEstado === "cobrado" ? new Date().toISOString() : null,
    };

    let error;
    if (existing) {
      ({ error } = await supabase.from("tareas").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("tareas").insert({
        ...payload,
        tipo: "manual",
        origen: "cobranzas",
        titulo: `Cobranza — ${gestionDialog.nombre}`,
        rol_destino: "admin",
        entidad_tipo: "cobranza",
        entidad_id: key,
        dedupe_key: key,
        prioridad: "alta",
        created_by: uid,
      } as any));
    }
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("No se pudo guardar la gestión");
      return;
    }
    toast.success("Gestión actualizada");
    setGestionDialog(null);
    fetchData();
  };

  const handleExport = () => {
    const headers = ["Alumno", "Email", "Teléfono", "Moneda", "Total", "Mora", "Gestión", "Detalle"];
    const lines = [headers.join(",")];
    grupos.forEach((g) => {
      lines.push([
        `"${g.alumno.apellido || ""}, ${g.alumno.nombre}"`,
        `"${g.alumno.email || ""}"`,
        `"${g.alumno.telefono || ""}"`,
        g.alumno.moneda,
        g.total.toFixed(2),
        String(g.maxMora),
        GESTION_LABEL[g.gestion],
        `"${g.items.map((i) => `${ORIGEN_LABEL[i.fuente_tabla]}: ${i.concepto} (${i.saldo_item.toFixed(2)})`).join(" | ")}"`,
      ].join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cobranzas-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Cobranzas abiertas</span>
              <PeriodBadge scope="acumulado" label="Histórico" />
            </div>
            <p className="text-2xl font-bold mt-1">{kpis.cobranzas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium">Sin gestionar</span>
            <p className="text-2xl font-bold mt-1">{kpis.sinGestionar}</p>
          </CardContent>
        </Card>
        <Card className={kpis.promesasVencidas > 0 ? "border-destructive/40" : ""}>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Promesas vencidas
            </span>
            <p className="text-2xl font-bold mt-1 text-destructive">{kpis.promesasVencidas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-muted-foreground font-medium">Total a cobrar</span>
            <div className="mt-1 space-y-0.5">
              {Object.entries(kpis.porMoneda).length === 0 ? (
                <p className="text-2xl font-bold">—</p>
              ) : Object.entries(kpis.porMoneda).map(([m, v]) => (
                <p key={m} className="text-lg font-bold font-mono text-destructive leading-tight">
                  {formatPrice(v, m)}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar alumno, email o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={gestionFilter} onValueChange={setGestionFilter}>
          <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abiertas">Cobranzas abiertas</SelectItem>
            <SelectItem value="pendiente">Sin gestionar</SelectItem>
            <SelectItem value="contactado">Contactados</SelectItem>
            <SelectItem value="promesa">Con promesa de pago</SelectItem>
            <SelectItem value="cobrado">Cobrados</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={origenFilter} onValueChange={setOrigenFilter}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Origen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los orígenes</SelectItem>
            {Object.entries(ORIGEN_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={moraFilter} onValueChange={setMoraFilter}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Mora" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda la mora</SelectItem>
            <SelectItem value="1_7">1 a 7 días</SelectItem>
            <SelectItem value="8_30">8 a 30 días</SelectItem>
            <SelectItem value="31">Más de 30 días</SelectItem>
          </SelectContent>
        </Select>

        <Select value={monedaFilter} onValueChange={setMonedaFilter}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Moneda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas monedas</SelectItem>
            {monedas.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={grupos.length === 0}>
          <Download className="h-4 w-4 mr-2" /> CSV
        </Button>
      </div>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="w-8" />
              <TableHead className="text-xs">Alumno</TableHead>
              <TableHead className="text-xs">Deuda</TableHead>
              <TableHead className="text-xs text-right w-32">Total</TableHead>
              <TableHead className="text-xs w-20 text-right">Mora</TableHead>
              <TableHead className="text-xs w-44">Gestión</TableHead>
              <TableHead className="text-xs w-44 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  {loading ? "Cargando cobranzas…" : "No hay cobranzas con estos filtros. 🎉"}
                </TableCell>
              </TableRow>
            ) : grupos.map((g) => {
              const isOpen = !!expanded[g.key];
              const tieneCredito = g.alumno.credito_disponible > 0.01;
              return (
                <Fragment key={g.key}>
                  <TableRow
                    className={`border-border hover:bg-muted/30 ${g.promesaVencida ? "bg-destructive/5" : ""}`}
                  >
                    <TableCell className="align-top pt-4">
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [g.key]: !isOpen }))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? "Contraer detalle" : "Ver detalle"}
                      >
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </TableCell>

                    <TableCell className="align-top">
                      <button
                        className="font-medium text-sm text-foreground hover:text-primary text-left"
                        onClick={() => navigate(`/admin/cuenta-corriente?alumno=${g.alumno.alumno_id}`)}
                      >
                        {g.alumno.apellido ? `${g.alumno.apellido}, ` : ""}{g.alumno.nombre}
                      </button>
                      <div className="text-[10px] text-muted-foreground">
                        {g.alumno.telefono || g.alumno.email || "—"}
                        {g.alumno.grupo ? ` · ${g.alumno.grupo}` : ""}
                      </div>
                    </TableCell>

                    <TableCell className="align-top">
                      <div className="flex flex-wrap items-center gap-1">
                        {Array.from(g.origenes).map((o) => (
                          <Badge key={o} variant="outline" className={`text-[10px] ${ORIGEN_TONE[o] || ""}`}>
                            {ORIGEN_LABEL[o] || o}
                          </Badge>
                        ))}
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {g.items.length} {g.items.length === 1 ? "concepto" : "conceptos"}
                        </span>
                      </div>
                      {tieneCredito && (
                        <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          Tiene {formatPrice(g.alumno.credito_disponible, g.alumno.moneda)} a favor
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top text-right font-mono text-sm font-bold text-destructive whitespace-nowrap">
                      {formatPrice(g.total, g.alumno.moneda)}
                      <div className="text-[10px] font-normal text-muted-foreground">{g.alumno.moneda}</div>
                    </TableCell>

                    <TableCell className="align-top text-right">
                      <Badge variant="outline" className={`text-[10px] ${moraTone(g.maxMora)}`}>
                        {g.maxMora}d
                      </Badge>
                    </TableCell>

                    <TableCell className="align-top max-w-[220px]">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          g.gestion === "cobrado" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : g.promesaVencida ? "bg-destructive/15 text-destructive border-destructive/30"
                            : g.gestion === "promesa" ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                            : g.gestion === "contactado" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {g.promesaVencida ? "Promesa vencida" : GESTION_LABEL[g.gestion]}
                      </Badge>
                      {g.tarea?.pospuesta_hasta && g.gestion === "promesa" && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Paga el {fmtDate(g.tarea.pospuesta_hasta)}
                        </div>
                      )}
                      {g.tarea?.nota_cierre && (
                        <p
                          title={g.tarea.nota_cierre}
                          className="text-[11px] leading-snug text-muted-foreground mt-1 line-clamp-2 break-words [overflow-wrap:anywhere] whitespace-pre-wrap"
                        >
                          {g.tarea.nota_cierre}
                        </p>
                      )}
                    </TableCell>


                    <TableCell className="align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        {g.alumno.telefono && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            title="Enviar WhatsApp"
                            onClick={() => window.open(waLink(g.alumno.telefono!, buildWaMessage(g)), "_blank")}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          title="Registrar gestión"
                          onClick={() => openGestion(g)}
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          title="Ver cuenta corriente"
                          onClick={() => navigate(`/admin/cuenta-corriente?alumno=${g.alumno.alumno_id}`)}
                        >
                          <Wallet className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {isOpen && g.items.map((i) => (
                    <TableRow key={`${g.key}-${i.fuente_tabla}-${i.fuente_id}`} className="bg-muted/20 border-border">
                      <TableCell />
                      <TableCell className="text-[11px] text-muted-foreground">
                        <Badge variant="outline" className={`text-[10px] ${ORIGEN_TONE[i.fuente_tabla] || ""}`}>
                          {ORIGEN_LABEL[i.fuente_tabla] || i.fuente_tabla}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-foreground">{i.concepto}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-destructive">
                        {formatPrice(i.saldo_item, i.moneda)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-[10px] text-muted-foreground">{i.dias_mora}d</span>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground" colSpan={2}>
                        Desde {fmtDate(i.fecha)}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog gestión */}
      <Dialog open={!!gestionDialog} onOpenChange={(v) => !v && setGestionDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar gestión</DialogTitle>
            <DialogDescription>{gestionDialog?.nombre}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Estado</Label>
              <Select value={gestionEstado} onValueChange={(v) => setGestionEstado(v as GestionEstado)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Sin gestionar</SelectItem>
                  <SelectItem value="contactado">Contactado</SelectItem>
                  <SelectItem value="promesa">Promesa de pago</SelectItem>
                  <SelectItem value="cobrado">Cobrado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {gestionEstado === "promesa" && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" /> Fecha comprometida
                </Label>
                <Input type="date" value={gestionFecha} onChange={(e) => setGestionFecha(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Nota</Label>
              <Textarea
                rows={3}
                placeholder="Ej: llamé y dijo que transfiere el viernes"
                value={gestionNota}
                onChange={(e) => setGestionNota(e.target.value)}
              />
            </div>

            {gestionEstado === "cobrado" && (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                Marcar como cobrado saca la fila del listado, pero la deuda sigue viva hasta registrar el pago real.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGestionDialog(null)}>Cancelar</Button>
            <Button onClick={saveGestion} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
