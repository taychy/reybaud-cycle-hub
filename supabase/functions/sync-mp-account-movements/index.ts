// Sincroniza movimientos (cobros) de cada cuenta MP activa (v2)
// public.mp_account_movements. Intenta auto-linkear con reservation_payments,
// suscripciones y alumnos por mp_payment_id y payer.email.
//
// POST /sync-mp-account-movements { days?: number, cuenta_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days ?? 7), 1), 90);
  const cuentaId: string | undefined = body?.cuenta_id;

  // Autenticación: acepta admin logueado O cron con service role via secreto x-cron-key
  const cronKey = req.headers.get("x-cron-key");
  const expectedCronKey = Deno.env.get("CRON_SECRET");
  const isCron = expectedCronKey && cronKey === expectedCronKey;

  if (!isCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "missing_token" });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json(401, { error: "invalid_token" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json(403, { error: "not_admin" });
  }

  const q = supabase
    .from("cuentas_mp")
    .select("id, slug, nombre, secret_name_token")
    .eq("activa", true);
  if (cuentaId) q.eq("id", cuentaId);
  const { data: cuentas, error: cErr } = await q;
  if (cErr) return json(500, { error: cErr.message });

  const results: any = { cuentas: [], errors: [] as any[] };
  const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
  const beginDate = sinceIso;
  const endDate = new Date().toISOString();

  for (const c of cuentas ?? []) {
    const token = Deno.env.get((c as any).secret_name_token);
    if (!token) {
      results.errors.push({ cuenta: c.slug, error: "token_no_configurado" });
      continue;
    }

    let inserted = 0, updated = 0, matched = 0;
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore && offset < 2000) {
      const url = new URL("https://api.mercadopago.com/v1/payments/search");
      url.searchParams.set("sort", "date_created");
      url.searchParams.set("criteria", "desc");
      url.searchParams.set("range", "date_created");
      url.searchParams.set("begin_date", beginDate);
      url.searchParams.set("end_date", endDate);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));

      let resp: Response;
      try {
        resp = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        results.errors.push({ cuenta: c.slug, error: `fetch_failed: ${(e as Error).message}` });
        break;
      }

      if (!resp.ok) {
        const txt = await resp.text();
        results.errors.push({ cuenta: c.slug, error: `mp_${resp.status}`, detail: txt.slice(0, 300) });
        break;
      }

      const payload = await resp.json();
      const items = payload?.results ?? [];
      const total = payload?.paging?.total ?? items.length;
      if (items.length === 0) break;

      const extractPayerName = (p: any): string | null => {
        const parts = [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(" ").trim();
        if (parts) return parts;
        const ai = [p?.additional_info?.payer?.first_name, p?.additional_info?.payer?.last_name].filter(Boolean).join(" ").trim();
        if (ai) return ai;
        const ch = p?.card?.cardholder?.name;
        if (ch) return String(ch);
        return null;
      };

      for (const p of items) {
        const mpId = String(p.id);
        // Intentar auto-linkear
        let resPayId: string | null = null;
        let subId: string | null = null;
        let alumnoId: string | null = null;

        const { data: rp } = await supabase
          .from("reservation_payments")
          .select("id, alumno_id")
          .eq("mp_payment_id", mpId)
          .maybeSingle();
        if (rp) {
          resPayId = rp.id;
          alumnoId = rp.alumno_id ?? null;
        } else {
          const { data: sub } = await supabase
            .from("suscripciones")
            .select("id, alumno_id")
            .eq("mp_payment_id", mpId)
            .maybeSingle();
          if (sub) {
            subId = sub.id;
            alumnoId = sub.alumno_id ?? null;
          }
        }

        // Si no hay match por payment_id, intentar por email del payer
        if (!alumnoId && p?.payer?.email) {
          const { data: al } = await supabase
            .from("alumnos")
            .select("id")
            .ilike("email", p.payer.email)
            .limit(1)
            .maybeSingle();
          if (al) alumnoId = al.id;
        }

        if (alumnoId || resPayId || subId) matched++;

        const feeAmount = Array.isArray(p?.fee_details)
          ? p.fee_details.reduce((s: number, f: any) => s + Number(f?.amount ?? 0), 0)
          : null;

        const row = {
          cuenta_mp_id: c.id,
          mp_payment_id: mpId,
          tipo: "payment",
          status: p?.status ?? null,
          status_detail: p?.status_detail ?? null,
          payment_method: p?.payment_method_id ?? null,
          payment_type: p?.payment_type_id ?? null,
          amount: Number(p?.transaction_amount ?? 0),
          net_received: p?.transaction_details?.net_received_amount != null
            ? Number(p.transaction_details.net_received_amount) : null,
          fee_amount: feeAmount,
          currency: p?.currency_id ?? "ARS",
          description: p?.description ?? null,
          payer_email: p?.payer?.email ?? null,
          payer_name: [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(" ") || null,
          payer_document: p?.payer?.identification?.number ?? null,
          external_reference: p?.external_reference ?? null,
          fecha_movimiento: p?.date_created ?? new Date().toISOString(),
          raw: p,
          alumno_id: alumnoId,
          reservation_payment_id: resPayId,
          suscripcion_id: subId,
        };

        const { data: existing } = await supabase
          .from("mp_account_movements")
          .select("id, alumno_id, assigned_manually")
          .eq("cuenta_mp_id", c.id)
          .eq("mp_payment_id", mpId)
          .maybeSingle();

        if (existing) {
          // No pisar asignaciones manuales
          const patch: any = { ...row };
          if (existing.assigned_manually) {
            delete patch.alumno_id;
            delete patch.reservation_payment_id;
            delete patch.suscripcion_id;
          }
          const { error } = await supabase
            .from("mp_account_movements")
            .update(patch)
            .eq("id", existing.id);
          if (error) results.errors.push({ cuenta: c.slug, mp: mpId, error: error.message });
          else updated++;
        } else {
          const { error } = await supabase.from("mp_account_movements").insert(row);
          if (error) results.errors.push({ cuenta: c.slug, mp: mpId, error: error.message });
          else inserted++;
        }

        // Procesar refunds asociados a este pago (si existen)
        const refunds = Array.isArray(p?.refunds) ? p.refunds : [];
        for (const rf of refunds) {
          const refundId = String(rf?.id ?? "");
          if (!refundId) continue;
          const refundKey = `${mpId}:refund:${refundId}`;
          const refundAmount = -Math.abs(Number(rf?.amount ?? 0));
          const refundDate = rf?.date_created ?? p?.date_last_updated ?? new Date().toISOString();
          const refundStatus = String(rf?.status ?? "approved");

          const refundRow = {
            cuenta_mp_id: c.id,
            mp_payment_id: refundKey,
            tipo: "refund",
            status: refundStatus,
            status_detail: rf?.status ?? null,
            payment_method: p?.payment_method_id ?? null,
            payment_type: p?.payment_type_id ?? null,
            amount: refundAmount,
            net_received: refundAmount,
            fee_amount: null,
            currency: p?.currency_id ?? "ARS",
            description: `Refund de pago ${mpId}${p?.description ? ` — ${p.description}` : ""}`,
            payer_email: p?.payer?.email ?? null,
            payer_name: [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(" ") || null,
            payer_document: p?.payer?.identification?.number ?? null,
            external_reference: p?.external_reference ?? null,
            fecha_movimiento: refundDate,
            raw: rf,
            alumno_id: alumnoId,
            reservation_payment_id: resPayId,
            suscripcion_id: subId,
          };

          const { data: existingRf } = await supabase
            .from("mp_account_movements")
            .select("id, assigned_manually")
            .eq("cuenta_mp_id", c.id)
            .eq("mp_payment_id", refundKey)
            .maybeSingle();

          if (existingRf) {
            const patch: any = { ...refundRow };
            if (existingRf.assigned_manually) {
              delete patch.alumno_id;
              delete patch.reservation_payment_id;
              delete patch.suscripcion_id;
            }
            const { error } = await supabase
              .from("mp_account_movements")
              .update(patch)
              .eq("id", existingRf.id);
            if (error) results.errors.push({ cuenta: c.slug, mp: refundKey, error: error.message });
            else updated++;
          } else {
            const { error } = await supabase.from("mp_account_movements").insert(refundRow);
            if (error) results.errors.push({ cuenta: c.slug, mp: refundKey, error: error.message });
            else inserted++;
          }
        }
      }

      offset += items.length;
      if (offset >= total) hasMore = false;
      await sleep(200);
    }

    results.cuentas.push({ cuenta: c.slug, inserted, updated, matched });
  }

  return json(200, { ok: true, ...results });
});
