import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/currency";
import { buildWhatsAppUrl } from "@/lib/contactInfo";
import {
  Users, UserMinus, UserPlus, Wallet, CircleDollarSign, Clock,
  AlertTriangle, Receipt, TrendingUp, MessageCircle, Download, Loader2,
} from "lucide-react";

// ───────────────────────── helpers ─────────────────────────

const GRACE_DAY = 5;

type MonedaTotal = { moneda: string; total: number };
type AlumnoLite = { id: string; nombre: string; telefono?: string | null };
type SubRow = {
  id: string;
  alumno_id: string;
  plan_id: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mp_status: string | null;
  metodo_pago: string | null;
  precio_base: number | null;
  precio_final: number | null;
  created_at: string;
  alumno: AlumnoLite | null;
  plan: { id: string; nombre: string; precio: number; moneda: string | null } | null;
};

type SubAudit = SubRow & {
  precio: number;
  moneda: string;
  diasAtraso: number;
};

const fmtMonthRange = (fechaRef: Date) => {
  const y = fechaRef.getFullYear();
  const m = fechaRef.getMonth();
  const inicio = new Date(y, m, 1);
  const fin = new Date(y, m + 1, 0);
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { inicio: toIso(inicio), fin: toIso(fin), label: inicio.toLocaleDateString("es-AR", { month: "long", year: "numeric" }) };
};

const sumByMoneda = (items: { moneda: string; precio: number }[]): MonedaTotal[] => {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.moneda, (map.get(it.moneda) || 0) + it.precio);
  return Array.from(map.entries()).map(([moneda, total]) => ({ moneda, total })).sort((a, b) => a.moneda.localeCompare(b.moneda));
};

const subPrecio = (s: SubRow): number =>
  Number(s.precio_final ?? s.precio_base ?? s.plan?.precio ?? 0);

const subMoneda = (s: SubRow): string => s.plan?.moneda || "ARS";

const isCobrada = (s: SubRow): boolean => {
  // Activa via MP aprobada, o conciliada manualmente.
  if (s.estado === "activa" && (s.mp_status === "approved" || (s.metodo_pago && s.metodo_pago !== "mercado_pago"))) return true;
  if (s.estado === "conciliado") return true;
  return false;
};

const toCSV = (rows: Record<string, any>[]): string => {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
};

const downloadCSV = (filename: string, rows: Record<string, any>[]) => {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ───────────────────────── component ─────────────────────────

type AuditPayload = {
  title: string;
  description: string;
  rows: SubAudit[];
  showAtraso?: boolean;
  showBajaInfo?: { tipo: string; fecha: string }[]; // optional per-row extra
  whatsApp?: boolean;
};

export default function SuperAdminEstadoEscuela() {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [bajas, setBajas] = useState<any[]>([]);
  const [gastos, setGastos] = useState<any[]>([]);
  const [ajustes, setAjustes] = useState<any[]>([]);
  const [audit, setAudit] = useState<AuditPayload | null>(null);

  const hoy = useMemo(() => new Date(), []);
  const { inicio: mesInicio, fin: mesFin, label: mesLabel } = useMemo(() => fmtMonthRange(hoy), [hoy]);
  const hoyIso = useMemo(() => {
    const y = hoy.getFullYear(), m = hoy.getMonth() + 1, d = hoy.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }, [hoy]);
  const enGracia = hoy.getDate() <= GRACE_DAY;
  const graciaFin = `${mesInicio.slice(0, 8)}${String(GRACE_DAY).padStart(2, "0")}`; // YYYY-MM-05

  useEffect(() => {
    (async () => {
      setLoading(true);
      const mesSiguienteInicio = (() => {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      })();

      const [subsRes, bajasRes, gastosRes, ajustesRes] = await Promise.all([
        supabase
          .from("suscripciones")
          .select("id, alumno_id, plan_id, estado, fecha_inicio, fecha_fin, mp_status, metodo_pago, precio_base, precio_final, created_at, alumno:alumnos(id, nombre, telefono), plan:planes(id, nombre, precio, moneda)")
          .or(`and(fecha_inicio.lte.${mesFin},or(fecha_fin.gte.${mesInicio},fecha_fin.is.null)),and(fecha_inicio.gte.${mesInicio},fecha_inicio.lte.${mesFin}),and(fecha_fin.gte.${mesInicio},fecha_fin.lt.${mesSiguienteInicio})`),
        supabase
          .from("bajas_solicitudes")
          .select("id, alumno_id, estado, confirmada_at, motivo, comentario, snapshot, created_at")
          .eq("estado", "confirmada")
          .gte("confirmada_at", `${mesInicio}T00:00:00Z`)
          .lt("confirmada_at", `${mesSiguienteInicio}T00:00:00Z`),
        supabase
          .from("gastos")
          .select("id, monto, moneda, fecha, categoria, descripcion")
          .gte("fecha", mesInicio)
          .lte("fecha", mesFin),
        supabase
          .from("cuenta_ajustes")
          .select("id, alumno_id, tipo, concepto, monto, moneda, fecha")
          .lt("monto", 0)
          .gte("fecha", mesInicio)
          .lte("fecha", mesFin),
      ]);
      setSubs((subsRes.data || []) as any);
      setBajas(bajasRes.data || []);
      setGastos(gastosRes.data || []);
      setAjustes(ajustesRes.data || []);
      setLoading(false);
    })();
  }, [mesInicio, mesFin, hoy]);

  // ── derived ────────────────────────────────────────────
  const m = useMemo(() => {
    // alumnos con baja confirmada en gracia (impactan este mes)
    const bajasAlumnoGracia = new Set(
      bajas
        .filter(b => b.confirmada_at && b.confirmada_at.slice(0, 10) <= graciaFin)
        .map(b => b.alumno_id)
    );
    // alumnos con devolución registrada este mes (impactan este mes aunque fuera de gracia)
    const alumnosConDevolucion = new Set(ajustes.map(a => a.alumno_id));
    const bajasAlumnoConDev = new Set(
      bajas
        .filter(b => b.confirmada_at && b.confirmada_at.slice(0, 10) > graciaFin && alumnosConDevolucion.has(b.alumno_id))
        .map(b => b.alumno_id)
    );
    const bajasImpactanMes = new Set([...bajasAlumnoGracia, ...bajasAlumnoConDev]);

    // suscripciones que cubren el mes (sin filtrar bajas todavía)
    const subsMes = subs.filter(s => {
      if (!s.fecha_inicio) return false;
      if (s.fecha_inicio > mesFin) return false;
      if (s.fecha_fin && s.fecha_fin < mesInicio) return false;
      if (s.estado === "cancelada") return false;
      return true;
    });

    // suscriptos del mes = subsMes − bajas que impactan este mes
    const suscriptosRows: SubAudit[] = subsMes
      .filter(s => !bajasImpactanMes.has(s.alumno_id))
      .map(s => ({ ...s, precio: subPrecio(s), moneda: subMoneda(s), diasAtraso: 0 }));

    const nuevasAltasRows: SubAudit[] = subs
      .filter(s => s.fecha_inicio && s.fecha_inicio >= mesInicio && s.fecha_inicio <= mesFin)
      .map(s => ({ ...s, precio: subPrecio(s), moneda: subMoneda(s), diasAtraso: 0 }));

    // cobradas
    const cobradasRows = suscriptosRows.filter(s => isCobrada(s));
    // por cobrar
    const porCobrarRows = suscriptosRows.filter(s => !isCobrada(s));

    const morososRows: SubAudit[] = porCobrarRows
      .filter(s => !enGracia)
      .map(s => {
        const refDate = s.fecha_inicio && s.fecha_inicio > mesInicio ? s.fecha_inicio : graciaFin;
        const diff = Math.max(0, Math.floor((hoy.getTime() - new Date(refDate + "T00:00:00").getTime()) / 86400000));
        return { ...s, diasAtraso: diff };
      });
    const enGraciaRows: SubAudit[] = enGracia ? porCobrarRows : [];

    // bajas
    const bajasExplicitas = bajas.map(b => {
      const tipo = b.confirmada_at.slice(0, 10) <= graciaFin
        ? "gracia (este mes)"
        : alumnosConDevolucion.has(b.alumno_id)
          ? "con devolución (este mes)"
          : "fuera gracia (mes siguiente)";
      return { ...b, tipo };
    });

    // bajas tácitas: subs vencidas el mes anterior, sin renovación este mes, hoy > día 5
    const subsConRenovacionEnMes = new Set(
      subs.filter(s => s.fecha_inicio && s.fecha_inicio >= mesInicio && s.fecha_inicio <= mesFin).map(s => s.alumno_id)
    );
    const bajasTacitasRows: SubAudit[] = !enGracia
      ? subs
          .filter(s =>
            s.fecha_fin &&
            s.fecha_fin < mesInicio &&
            !subsConRenovacionEnMes.has(s.alumno_id) &&
            !bajas.some(b => b.alumno_id === s.alumno_id) &&
            s.estado !== "cancelada",
          )
          // dedupe por alumno (última sub vencida)
          .reduce<SubRow[]>((acc, s) => {
            const prev = acc.find(x => x.alumno_id === s.alumno_id);
            if (!prev || (prev.fecha_fin || "") < (s.fecha_fin || "")) {
              return [...acc.filter(x => x.alumno_id !== s.alumno_id), s];
            }
            return acc;
          }, [])
          .map(s => ({ ...s, precio: subPrecio(s), moneda: subMoneda(s), diasAtraso: 0 }))
      : [];

    const esperado = sumByMoneda(suscriptosRows);
    const cobrado = sumByMoneda(cobradasRows);
    const porCobrarGracia = sumByMoneda(enGraciaRows);
    const porCobrarMora = sumByMoneda(morososRows);

    const gastosByMoneda = (() => {
      const map = new Map<string, number>();
      for (const g of gastos) {
        const mon = g.moneda || "ARS";
        map.set(mon, (map.get(mon) || 0) + Number(g.monto || 0));
      }
      return Array.from(map.entries()).map(([moneda, total]) => ({ moneda, total })).sort((a, b) => a.moneda.localeCompare(b.moneda));
    })();

    // Resultado por moneda (proyectado = esperado − gastos; real = cobrado − gastos)
    const resultadoProy = esperado.map(e => ({
      moneda: e.moneda,
      total: e.total - (gastosByMoneda.find(g => g.moneda === e.moneda)?.total || 0),
    }));
    const resultadoReal = cobrado.map(c => ({
      moneda: c.moneda,
      total: c.total - (gastosByMoneda.find(g => g.moneda === c.moneda)?.total || 0),
    }));

    return {
      suscriptosRows, nuevasAltasRows, cobradasRows, porCobrarRows,
      enGraciaRows, morososRows, bajasExplicitas, bajasTacitasRows,
      esperado, cobrado, porCobrarGracia, porCobrarMora,
      gastosByMoneda, resultadoProy, resultadoReal,
    };
  }, [subs, bajas, gastos, ajustes, mesInicio, mesFin, graciaFin, enGracia, hoy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculando métricas…
      </div>
    );
  }

  const openAudit = (payload: AuditPayload) => setAudit(payload);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold uppercase tracking-wide">Estado de la escuela</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {mesLabel} · día {hoy.getDate()} {enGracia ? "(en gracia)" : `(día > ${GRACE_DAY})`}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Período de gracia hasta día {GRACE_DAY}
        </Badge>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Suscriptos */}
        <MetricCard
          icon={Users}
          title="Suscriptos del mes"
          accent="text-primary"
          mainValue={String(m.suscriptosRows.length)}
          subtitle={`${m.nuevasAltasRows.length} altas nuevas en el período`}
          onAudit={() => openAudit({
            title: "Suscriptos del mes",
            description: "Alumnos activos que cubren el mes (excluye bajas en gracia y bajas con devolución).",
            rows: m.suscriptosRows,
          })}
        />

        {/* Bajas */}
        <MetricCard
          icon={UserMinus}
          title="Bajas del mes"
          accent="text-destructive"
          mainValue={String(m.bajasExplicitas.length + m.bajasTacitasRows.length)}
          subtitle={`Explícitas: ${m.bajasExplicitas.length} · Tácitas: ${m.bajasTacitasRows.length}`}
          onAudit={() => openAudit({
            title: "Bajas del mes",
            description: "Bajas confirmadas (clasificadas) + tácitas (sub vencida sin renovar tras el día 5).",
            rows: m.bajasTacitasRows,
          })}
          extra={
            <ul className="text-xs text-muted-foreground space-y-0.5 mt-2">
              {["gracia (este mes)", "con devolución (este mes)", "fuera gracia (mes siguiente)"].map(t => (
                <li key={t} className="flex justify-between">
                  <span>{t}</span>
                  <span className="font-mono">{m.bajasExplicitas.filter((b: any) => b.tipo === t).length}</span>
                </li>
              ))}
            </ul>
          }
        />

        {/* Nuevas altas */}
        <MetricCard
          icon={UserPlus}
          title="Nuevas altas"
          accent="text-emerald-500"
          mainValue={String(m.nuevasAltasRows.length)}
          subtitle="Suscripciones que comenzaron este mes"
          onAudit={() => openAudit({
            title: "Nuevas altas",
            description: "Suscripciones con fecha de inicio dentro del mes en curso.",
            rows: m.nuevasAltasRows,
          })}
        />

        {/* Esperado por moneda */}
        <MetricCard
          icon={CircleDollarSign}
          title="Esperado"
          accent="text-amber-500"
          mainValue=""
          subtitle="Facturación proyectada del mes"
          extra={<MonedaList items={m.esperado} />}
          onAudit={() => openAudit({
            title: "Esperado del mes (detalle)",
            description: "Suma de precios de los suscriptos del mes, agrupado por moneda.",
            rows: m.suscriptosRows,
          })}
        />

        {/* Cobrado */}
        <MetricCard
          icon={Wallet}
          title="Cobrado"
          accent="text-emerald-500"
          mainValue=""
          subtitle="Pagos confirmados del mes"
          extra={<MonedaList items={m.cobrado} />}
          onAudit={() => openAudit({
            title: "Cobrado del mes",
            description: "Suscripciones del mes con estado activa (MP aprobada o método manual) o conciliada.",
            rows: m.cobradasRows,
          })}
        />

        {/* Por cobrar */}
        <MetricCard
          icon={Clock}
          title="Por cobrar"
          accent="text-yellow-500"
          mainValue=""
          subtitle={enGracia ? "Todavía en gracia" : `Mora · ${m.morososRows.length} alumnos`}
          extra={
            <div className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">En gracia</p>
                <MonedaList items={m.porCobrarGracia} muted />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Mora</p>
                <MonedaList items={m.porCobrarMora} muted />
              </div>
            </div>
          }
          onAudit={() => openAudit({
            title: "Por cobrar",
            description: "Suscriptos del mes que aún no pagaron.",
            rows: m.porCobrarRows.map(s => ({
              ...s,
              diasAtraso: enGracia ? 0 : Math.max(0, hoy.getDate() - GRACE_DAY),
            })),
            showAtraso: !enGracia,
          })}
        />

        {/* Morosos */}
        <MetricCard
          icon={AlertTriangle}
          title="Morosos (posible baja)"
          accent="text-orange-500"
          mainValue={String(m.morososRows.length)}
          subtitle={enGracia ? "Disponible tras el día 5" : "Contactar por WhatsApp"}
          onAudit={() => openAudit({
            title: "Morosos — cola de seguimiento",
            description: "Alumnos con sub vigente impaga, posibles bajas. Contactar por WhatsApp.",
            rows: m.morososRows,
            showAtraso: true,
            whatsApp: true,
          })}
        />

        {/* Gastos */}
        <MetricCard
          icon={Receipt}
          title="Gastos del mes"
          accent="text-rose-500"
          mainValue=""
          subtitle={`${gastos.length} registros`}
          extra={<MonedaList items={m.gastosByMoneda} />}
        />

        {/* Resultado */}
        <MetricCard
          icon={TrendingUp}
          title="Resultado"
          accent="text-primary"
          mainValue=""
          subtitle="Proyectado (esperado − gastos) vs Real (cobrado − gastos)"
          extra={
            <div className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Proyectado</p>
                <MonedaList items={m.resultadoProy} muted />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Real</p>
                <MonedaList items={m.resultadoReal} muted />
              </div>
            </div>
          }
        />
      </div>

      <AuditDrawer
        audit={audit}
        onClose={() => setAudit(null)}
        mesInicio={mesInicio}
        graciaFin={graciaFin}
        hoyIso={hoyIso}
      />
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function MetricCard({
  icon: Icon, title, mainValue, subtitle, extra, accent, onAudit,
}: {
  icon: any; title: string; mainValue: string; subtitle?: string;
  extra?: React.ReactNode; accent?: string; onAudit?: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className={`w-4 h-4 ${accent || ""}`} />
          {title}
        </CardTitle>
        {onAudit && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onAudit}>
            Auditar
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {mainValue && <div className={`text-3xl font-bold ${accent || ""}`}>{mainValue}</div>}
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {extra && <div className="mt-3">{extra}</div>}
      </CardContent>
    </Card>
  );
}

function MonedaList({ items, muted }: { items: MonedaTotal[]; muted?: boolean }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <ul className="space-y-0.5">
      {items.map(it => (
        <li key={it.moneda} className={`flex justify-between ${muted ? "text-sm" : "text-base font-semibold"}`}>
          <span className="text-xs text-muted-foreground">{it.moneda}</span>
          <span className="font-mono">{formatPrice(it.total, it.moneda)}</span>
        </li>
      ))}
    </ul>
  );
}

function AuditDrawer({
  audit, onClose, mesInicio, graciaFin, hoyIso,
}: { audit: AuditPayload | null; onClose: () => void; mesInicio: string; graciaFin: string; hoyIso: string }) {
  const open = audit !== null;
  const rows = audit?.rows || [];

  const exportCSV = () => {
    if (!audit) return;
    const data = rows.map(r => ({
      alumno: r.alumno?.nombre || "",
      telefono: r.alumno?.telefono || "",
      plan: r.plan?.nombre || "",
      precio: r.precio,
      moneda: r.moneda,
      estado: r.estado,
      fecha_inicio: r.fecha_inicio || "",
      fecha_fin: r.fecha_fin || "",
      mp_status: r.mp_status || "",
      metodo_pago: r.metodo_pago || "",
      dias_atraso: r.diasAtraso || 0,
    }));
    downloadCSV(`${audit.title.toLowerCase().replace(/\s+/g, "-")}-${hoyIso}.csv`, data);
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle>{audit?.title}</DrawerTitle>
              <DrawerDescription>{audit?.description}</DrawerDescription>
              <p className="text-xs text-muted-foreground mt-1">
                Fuente: <code>suscripciones</code>, <code>planes</code>, <code>bajas_solicitudes</code>,
                <code> cuenta_ajustes</code>. Mes: {mesInicio} · Gracia hasta {graciaFin}.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No hay registros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  {audit?.showAtraso && <TableHead className="text-right">Atraso</TableHead>}
                  {audit?.whatsApp && <TableHead>Acción</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.alumno?.nombre || "—"}</TableCell>
                    <TableCell className="text-xs">{r.plan?.nombre || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatPrice(r.precio, r.moneda)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.estado}</Badge></TableCell>
                    <TableCell className="text-xs">{r.fecha_inicio || "—"}</TableCell>
                    <TableCell className="text-xs">{r.fecha_fin || "—"}</TableCell>
                    {audit?.showAtraso && <TableCell className="text-right font-mono">{r.diasAtraso}d</TableCell>}
                    {audit?.whatsApp && (
                      <TableCell>
                        {r.alumno?.telefono ? (
                          <a
                            href={buildWhatsAppUrl(
                              `Hola ${r.alumno.nombre.split(" ")[0]}, te escribo de Reybaud. Vimos que tu cuota del mes aún no figura paga. ¿Seguís con nosotros este mes?`,
                              r.alumno.telefono.replace(/\D/g, ""),
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:underline"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">sin tel.</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
