// Renovación mensual automática de suscripciones.
//
// Modelo:
//  - Al primer día del mes (o al ejecutar manualmente con targetDate/backfill=true),
//    tomamos toda sub 'activa' pagada cuyo fecha_fin ya pasó y NO fue cancelada,
//    NO tiene baja en trámite, NO es de categoría pausa/asesoria, y NO tiene ya
//    una renovación creada para el período siguiente.
//  - Marcamos la vieja como estado='vencida' (UI la muestra como "Finalizada"
//    gracias a getEffectiveSubStatus + origen pagado).
//  - Insertamos una NUEVA sub para el mes siguiente:
//       plan_id = old.plan_id
//       fecha_inicio = old.fecha_fin + 1 día
//       fecha_fin    = último día del mes de fecha_inicio
//       estado       = 'pendiente'
//       origen_registro = 'renovacion_pendiente'
//       auto_renovacion = old.auto_renovacion (heredado)
//       descuento_id / precio_final = copiamos descuento de la vieja SÓLO si el descuento sigue vigente
//                                     (respetando fecha_vencimiento si tiene).
//  - Idempotencia: si ya existe una sub del mismo alumno_id+plan_id con fecha_inicio
//    correspondiente al mes siguiente, no duplicamos.
//
// Excluídos:
//   - Alumnos con baja_solicitud abierta (estado='solicitada')
//   - Alumnos con pausa vigente (plan categoria='pausa' activa a hoy)
//   - Cambios de plan pendientes: NO. Regla del negocio: usar el plan de la ÚLTIMA sub.
//     Los cambios programados se aplican por otras vías.
//
// Uso:
//   POST body { dryRun?: boolean, targetDate?: 'YYYY-MM-DD' }
//     dryRun: true → no escribe, sólo devuelve el plan.
//     targetDate: fecha "de corte" (por defecto hoy). Se procesan subs con fecha_fin < targetDate.
//
// Programado por pg_cron diariamente (00:05 America/Argentina/Buenos_Aires).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAID_ORIGENES = ["automatico", "cargado_admin"];

/** Último día del mes (YYYY-MM-DD) de la fecha dada. */
function endOfMonthISO(dateISO: string): string {
  const [y, m] = dateISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month
  return d.toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { dryRun?: boolean; targetDate?: string } = {};
  try {
    if (req.method === "POST") body = await req.json();
  } catch { /* empty body ok */ }

  const target = body.targetDate || todayISO();
  const dryRun = !!body.dryRun;

  console.log("[renew-monthly-subs] start", { target, dryRun });

  // 1) Candidatas: subs 'activa' o 'vencida' con fecha_fin < target, pagadas, no canceladas.
  //    Ambos estados representan períodos cerrados: 'activa' = aún no procesada por este cron;
  //    'vencida' = ya marcada como finalizada. Ambas pueden necesitar renovación.
  const { data: candidates, error: candErr } = await supabase
    .from("suscripciones")
    .select("id, alumno_id, plan_id, fecha_inicio, fecha_fin, estado, origen_registro, mp_status, auto_renovacion, descuento_id, precio_base, precio_final, planes(id, nombre, categoria, precio, moneda), descuentos(id, valor, tipo, vigencia_hasta, activo)")
    .in("estado", ["activa", "vencida"])
    .lt("fecha_fin", target)
    .is("cancelada_at", null);

  if (candErr) {
    console.error("[renew-monthly-subs] fetch error", candErr);
    return new Response(JSON.stringify({ error: candErr.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const paidCandidates = (candidates || []).filter((s: any) => {
    // Sólo pagadas
    const paid = s.mp_status === "approved" || PAID_ORIGENES.includes(s.origen_registro);
    if (!paid) return false;
    // Excluir categorías que no auto-renuevan
    const cat = s.planes?.categoria;
    if (cat === "pausa" || cat === "asesoria") return false;
    return true;
  });

  // Deduplicar: por alumno+plan quedarse con la más reciente (max fecha_fin).
  // Evita generar renovaciones para períodos viejos ya cerrados.
  const latestByKey = new Map<string, any>();
  for (const s of paidCandidates) {
    const key = `${s.alumno_id}|${s.plan_id}`;
    const cur = latestByKey.get(key);
    if (!cur || s.fecha_fin > cur.fecha_fin) latestByKey.set(key, s);
  }
  const filtered = Array.from(latestByKey.values());

  // 2) Excluir alumnos con baja en trámite
  const alumnoIds = Array.from(new Set(filtered.map((s: any) => s.alumno_id)));
  let bajaOpen = new Set<string>();
  let pausaOpen = new Set<string>();
  if (alumnoIds.length) {
    const { data: bajas } = await supabase
      .from("bajas_solicitudes")
      .select("alumno_id")
      .in("alumno_id", alumnoIds)
      .eq("estado", "solicitada");
    bajaOpen = new Set((bajas || []).map((b: any) => b.alumno_id));

    // Pausa vigente = sub activa cuya plan.categoria='pausa' y hoy dentro de rango
    const { data: pausas } = await supabase
      .from("suscripciones")
      .select("alumno_id, fecha_inicio, fecha_fin, estado, planes!inner(categoria)")
      .in("alumno_id", alumnoIds)
      .eq("planes.categoria", "pausa")
      .eq("estado", "activa")
      .is("cancelada_at", null)
      .gte("fecha_fin", target);
    pausaOpen = new Set((pausas || []).map((p: any) => p.alumno_id));
  }

  const eligible = filtered.filter((s: any) => !bajaOpen.has(s.alumno_id) && !pausaOpen.has(s.alumno_id));

  // 3) Chequeo idempotencia: para cada elegible, ¿ya existe renovación?
  //    Renovación = misma alumno+plan con fecha_inicio > old.fecha_fin.
  const renewals: any[] = [];
  const skipped: any[] = [];

  // Mes destino de la renovación = mes de `target` (día 1 al último día).
  // Si la vieja terminó hace tiempo, igual la renovación va al mes en curso, no a un mes pasado.
  const [ty, tm] = target.split("-").map(Number);
  const targetMonthStart = `${ty}-${String(tm).padStart(2, "0")}-01`;

  for (const old of eligible) {
    const naturalNext = addDaysISO(old.fecha_fin, 1);
    const newFechaIni = naturalNext > targetMonthStart ? naturalNext : targetMonthStart;
    const newFechaFin = endOfMonthISO(newFechaIni);

    const { data: existing } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("alumno_id", old.alumno_id)
      .eq("plan_id", old.plan_id)
      .gt("fecha_inicio", old.fecha_fin)
      .limit(1);

    if (existing && existing.length) {
      skipped.push({ old_sub_id: old.id, reason: "renewal_exists", existing_id: existing[0].id });
      continue;
    }

    // Descuento heredado sólo si sigue vigente (activo + no expirado)
    let inheritDesc: string | null = null;
    let inheritPrecio: number | null = null;
    const d = old.descuentos;
    if (old.descuento_id && d?.activo) {
      const notExpired = !d.vigencia_hasta || d.vigencia_hasta >= newFechaIni;
      if (notExpired) {
        inheritDesc = old.descuento_id;
        inheritPrecio = old.precio_final ?? null;
      }
    }

    renewals.push({
      old_sub_id: old.id,
      alumno_id: old.alumno_id,
      plan_id: old.plan_id,
      fecha_inicio: newFechaIni,
      fecha_fin: newFechaFin,
      estado: "pendiente",
      origen_registro: "renovacion_pendiente",
      auto_renovacion: old.auto_renovacion,
      descuento_id: inheritDesc,
      precio_base: old.planes?.precio ?? old.precio_base ?? null,
      precio_final: inheritPrecio ?? old.planes?.precio ?? old.precio_base ?? null,
      metodo_pago: "efectivo",
    });
  }

  if (dryRun) {
    return new Response(JSON.stringify({
      dryRun: true,
      target,
      totalCandidates: candidates?.length || 0,
      afterFilters: eligible.length,
      willRenew: renewals.length,
      willSkip: skipped.length,
      renewals,
      skipped,
      excluded: {
        con_baja: Array.from(bajaOpen),
        con_pausa: Array.from(pausaOpen),
      },
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // 4) Ejecutar: marcar vieja 'vencida' + insertar nueva
  const results: any[] = [];
  for (const r of renewals) {
    // insertar nueva
    const { data: newSub, error: insErr } = await supabase
      .from("suscripciones")
      .insert({
        alumno_id: r.alumno_id,
        plan_id: r.plan_id,
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        estado: r.estado,
        origen_registro: r.origen_registro,
        auto_renovacion: r.auto_renovacion,
        descuento_id: r.descuento_id,
        precio_base: r.precio_base,
        precio_final: r.precio_final,
        metodo_pago: r.metodo_pago,
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("[renew-monthly-subs] insert error", { old: r.old_sub_id, err: insErr });
      results.push({ old_sub_id: r.old_sub_id, ok: false, error: insErr.message });
      continue;
    }

    // marcar vieja como vencida (finalizada)
    const { error: updErr } = await supabase
      .from("suscripciones")
      .update({ estado: "vencida" })
      .eq("id", r.old_sub_id);

    if (updErr) {
      console.error("[renew-monthly-subs] update old error", { old: r.old_sub_id, err: updErr });
      results.push({ old_sub_id: r.old_sub_id, new_sub_id: newSub.id, ok: false, error: updErr.message });
      continue;
    }

    results.push({ old_sub_id: r.old_sub_id, new_sub_id: newSub.id, ok: true });
  }

  console.log("[renew-monthly-subs] done", {
    target, renewed: results.filter(x => x.ok).length, failed: results.filter(x => !x.ok).length, skipped: skipped.length,
  });

  return new Response(JSON.stringify({
    target,
    processed: results.length,
    renewed: results.filter(x => x.ok).length,
    failed: results.filter(x => !x.ok).length,
    skipped: skipped.length,
    results,
    skipped_detail: skipped,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});
