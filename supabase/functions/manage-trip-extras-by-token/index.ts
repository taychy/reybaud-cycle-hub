import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN_RE = /^[a-f0-9]{32,128}$/i;
const NIGHT_RE = /noche[s]?\s+extra/i;
const VALID_TIMINGS = new Set(["antes", "despues", "ambas"]);

type Selection = {
  addon_id?: string;
  cantidad?: number;
  noche_timing?: string | null;
};

type Body = {
  action?: "get" | "save";
  token?: string;
  selections?: Selection[];
};

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action ?? "get";
    const token = (body.token || "").trim();
    if (!TOKEN_RE.test(token)) return json({ error: "invalid_token" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: reservation, error: reservationError } = await supabase
      .from("event_reservations")
      .select("id, event_id, alumno_id, reservation_status, amount_total, amount_paid, balance_due, moneda, currency_snapshot")
      .eq("access_token", token)
      .maybeSingle();

    if (reservationError) return json({ error: "lookup_failed", detail: reservationError.message }, 500);
    if (!reservation) return json({ error: "not_found" }, 404);

    const { data: addons, error: addonsError } = await supabase
      .from("event_addons")
      .select("id, event_id, nombre, descripcion, precio, currency, tipo, max_por_participante, stock_total, activo, sort_order, created_at")
      .eq("event_id", reservation.event_id)
      .eq("activo", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (addonsError) return json({ error: "addons_failed", detail: addonsError.message }, 500);

    const loadContracted = async () => {
      const { data, error } = await supabase
        .from("reservation_addons")
        .select("id, reservation_id, addon_id, cantidad, precio_unitario, subtotal, currency, notas, noche_timing, created_at")
        .eq("reservation_id", reservation.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    };

    if (action === "get") {
      const contracted = await loadContracted();
      return json({
        ok: true,
        event_id: reservation.event_id,
        reservation_status: reservation.reservation_status,
        addons: addons ?? [],
        contracted,
      });
    }

    if (action !== "save") return json({ error: "invalid_action" }, 400);
    if (["cancelada", "rechazada"].includes(reservation.reservation_status)) {
      return json({ error: "reservation_not_editable" }, 409);
    }

    const selections = Array.isArray(body.selections) ? body.selections : [];
    if (selections.length > 100) return json({ error: "too_many_selections" }, 400);

    const addonMap = new Map((addons ?? []).map((addon: any) => [addon.id, addon]));
    const normalized = new Map<string, { cantidad: number; noche_timing: string | null }>();

    for (const row of selections) {
      const addonId = typeof row?.addon_id === "string" ? row.addon_id : "";
      const addon: any = addonMap.get(addonId);
      if (!addon) return json({ error: "addon_not_available", addon_id: addonId }, 400);
      if (normalized.has(addonId)) return json({ error: "duplicate_addon", addon_id: addonId }, 400);

      const isNight = NIGHT_RE.test(addon.nombre || "");
      let timing: string | null = null;
      let cantidad = 0;

      if (isNight) {
        timing = typeof row.noche_timing === "string" && VALID_TIMINGS.has(row.noche_timing)
          ? row.noche_timing
          : null;
        cantidad = timing === "ambas" ? 2 : timing ? 1 : 0;
      } else {
        const raw = Number(row.cantidad ?? 0);
        if (!Number.isInteger(raw) || raw < 0) return json({ error: "invalid_quantity", addon_id: addonId }, 400);
        cantidad = raw;
        const max = Number(addon.max_por_participante || 0);
        if (max > 0 && cantidad > max) return json({ error: "max_exceeded", addon_id: addonId, max }, 409);
      }

      normalized.set(addonId, { cantidad, noche_timing: timing });
    }

    const requestedIds = Array.from(normalized.keys());
    const [{ data: currentRows, error: currentError }, stockResult] = await Promise.all([
      loadContracted().then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
      requestedIds.length
        ? supabase
            .from("reservation_addons")
            .select("addon_id, reservation_id, cantidad")
            .in("addon_id", requestedIds)
            .neq("reservation_id", reservation.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (currentError) return json({ error: "contracted_failed", detail: currentError.message }, 500);
    if (stockResult.error) return json({ error: "stock_failed", detail: stockResult.error.message }, 500);

    const usedByAddon = new Map<string, number>();
    for (const row of stockResult.data ?? []) {
      usedByAddon.set(row.addon_id, (usedByAddon.get(row.addon_id) || 0) + Number(row.cantidad || 0));
    }

    for (const [addonId, choice] of normalized) {
      const addon: any = addonMap.get(addonId);
      const stock = addon.stock_total == null ? null : Number(addon.stock_total);
      if (stock != null && stock >= 0 && (usedByAddon.get(addonId) || 0) + choice.cantidad > stock) {
        return json({ error: "stock_exceeded", addon_id: addonId }, 409);
      }
    }

    for (const [addonId, choice] of normalized) {
      const addon: any = addonMap.get(addonId);
      const existing: any = (currentRows ?? []).find((row: any) => row.addon_id === addonId);

      if (existing && choice.cantidad <= 0) {
        const { error } = await supabase.from("reservation_addons").delete().eq("id", existing.id);
        if (error) return json({ error: "delete_failed", detail: error.message }, 500);
      } else if (existing && choice.cantidad > 0) {
        const { error } = await supabase.from("reservation_addons").update({
          cantidad: choice.cantidad,
          precio_unitario: Number(addon.precio || 0),
          currency: addon.currency,
          noche_timing: choice.noche_timing,
        }).eq("id", existing.id);
        if (error) return json({ error: "update_failed", detail: error.message }, 500);
      } else if (!existing && choice.cantidad > 0) {
        const { error } = await supabase.from("reservation_addons").insert({
          reservation_id: reservation.id,
          addon_id: addonId,
          cantidad: choice.cantidad,
          precio_unitario: Number(addon.precio || 0),
          currency: addon.currency,
          noche_timing: choice.noche_timing,
        });
        if (error) return json({ error: "insert_failed", detail: error.message }, 500);
      }
    }

    const contracted = await loadContracted();
    const selected = contracted
      .map((row: any) => {
        const addon: any = addonMap.get(row.addon_id);
        if (!addon) return null;
        return {
          addon_id: row.addon_id,
          nombre: addon.nombre,
          cantidad: Number(row.cantidad || 0),
          precio_unitario: Number(row.precio_unitario || addon.precio || 0),
          currency: row.currency || addon.currency,
          noche_timing: row.noche_timing || null,
        };
      })
      .filter(Boolean);

    const checklistPayload = {
      reservation_id: reservation.id,
      alumno_id: reservation.alumno_id,
      step_key: "extras",
      completed: true,
      needs_advice: false,
      data: {
        selected,
        declined: selected.length === 0,
        updated_at: new Date().toISOString(),
      },
      file_url: null,
    };

    const { data: existingChecklist } = await supabase
      .from("reservation_checklist_data")
      .select("id")
      .eq("reservation_id", reservation.id)
      .eq("step_key", "extras")
      .maybeSingle();

    if (existingChecklist?.id) {
      await supabase.from("reservation_checklist_data").update(checklistPayload).eq("id", existingChecklist.id);
    } else {
      await supabase.from("reservation_checklist_data").insert(checklistPayload);
    }

    const { data: refreshed } = await supabase
      .from("event_reservations")
      .select("amount_total, amount_paid, balance_due, moneda, currency_snapshot")
      .eq("id", reservation.id)
      .maybeSingle();

    return json({
      ok: true,
      event_id: reservation.event_id,
      reservation_status: reservation.reservation_status,
      addons: addons ?? [],
      contracted,
      reservation: refreshed ?? null,
    });
  } catch (error) {
    return json({ error: "internal_error", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
