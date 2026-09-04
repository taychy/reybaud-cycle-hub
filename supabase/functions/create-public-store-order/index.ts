import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCuentaMP } from "../_shared/resolve-cuenta-mp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ENTREGA = ["clase_kdt", "clase_parque", "moto", "retiro_local"] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const productId = String(body?.product_id || "");
    const cantidad = Math.max(1, Math.min(20, Number(body?.cantidad) || 1));
    const nombre = String(body?.nombre || "").trim().slice(0, 120);
    const email = String(body?.email || "").trim().toLowerCase().slice(0, 160);
    const telefono = String(body?.telefono || "").trim().slice(0, 40);
    const entrega = String(body?.entrega_metodo || "");
    const direccion = String(body?.envio_direccion || "").trim().slice(0, 300);
    const observaciones = String(body?.observaciones || "").trim().slice(0, 500);
    const variante = (body?.variante && typeof body.variante === "object") ? body.variante : {};
    const optIn = body?.opt_in_marketing !== false;
    const metodoPago = String(body?.metodo_pago || "mp") === "efectivo" ? "efectivo" : "mp";


    if (!UUID_RE.test(productId)) return json({ error: "Producto inválido" }, 400);
    if (nombre.length < 3) return json({ error: "Ingresá tu nombre y apellido" }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "Email inválido" }, 400);
    if (telefono.replace(/\D/g, "").length < 8) return json({ error: "Teléfono inválido" }, 400);
    if (!ENTREGA.includes(entrega as any)) return json({ error: "Elegí una forma de entrega" }, 400);
    if (entrega === "moto" && direccion.length < 8) return json({ error: "Ingresá la dirección de envío" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: product } = await supabase
      .from("store_products")
      .select("id, name, price, currency, status, stock, variant_stock, variants, es_externo, supplier_id")
      .eq("id", productId)
      .eq("status", "active")
      .maybeSingle();

    if (!product) return json({ error: "El producto ya no está disponible" }, 404);

    // Stock check (por variante si corresponde)
    const specs: { name: string }[] = Array.isArray(product.variants) ? product.variants : [];
    let variantSig = "";
    if (specs.length) {
      variantSig = specs.map((s: any) => `${s.name}:${(variante as any)[s.name] || ""}`).join("|");
      if (specs.some((s: any) => !(variante as any)[s.name])) {
        return json({ error: "Elegí talle / color" }, 400);
      }
    }
    const disponible = variantSig
      ? Number((product.variant_stock as any)?.[variantSig] ?? 0)
      : (typeof product.stock === "number" ? product.stock : null);
    if (disponible != null && disponible < cantidad) {
      return json({ error: `Solo quedan ${disponible} unidades` }, 400);
    }

    const { data: priceRows, error: priceErr } = await supabase.rpc("resolver_precio_tienda", {
      p_product_id: product.id,
      p_variante: variante,
    });
    if (priceErr || !priceRows?.[0]) {
      console.error("[create-public-store-order] price resolver", priceErr);
      return json({ error: "No pudimos validar el precio del producto" }, 409);
    }
    const priceSnapshot = priceRows[0] as any;
    const unit = Number(priceSnapshot.precio_efectivo) || 0;

    // Mercado Pago sólo cobra en ARS: convertimos precios en USD/EUR con el tipo de cambio fijo.
    const moneda = String(product.currency || "ARS").toUpperCase();
    let fxRate = 1;
    if (moneda !== "ARS") {
      const fxKey = moneda === "USD" ? "fx_usd_ars" : moneda === "EUR" ? "fx_eur_ars" : null;
      if (!fxKey) return json({ error: "Moneda no soportada para el pago online" }, 400);
      const { data: cfg } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", fxKey)
        .maybeSingle();
      const raw = (cfg as any)?.value;
      fxRate = Number(typeof raw === "string" ? raw.replace(/[^\d.]/g, "") : raw) || 0;
      if (fxRate <= 0) {
        return json({ error: "El tipo de cambio no está configurado. Escribinos por WhatsApp para completar la compra." }, 400);
      }
    }
    const unitArs = Math.round(unit * fxRate * 100) / 100;
    const totalArs = Math.round(unitArs * cantidad * 100) / 100;
    const fxNota = moneda !== "ARS"
      ? `Precio original: ${moneda} ${unit} x ${cantidad} (TC ${fxRate}).`
      : "";


    // Vincular el pedido al alumno si el email (principal o adicional) coincide,
    // para que la compra impacte en su cuenta corriente.
    let alumnoId: string | null = null;
    try {
      const emailLc = email.trim().toLowerCase();
      const { data: byEmail } = await supabase
        .from("alumnos")
        .select("id")
        .ilike("email", emailLc)
        .limit(1)
        .maybeSingle();
      if (byEmail?.id) {
        alumnoId = byEmail.id;
      } else {
        const { data: byExtra } = await supabase
          .from("alumnos")
          .select("id, emails_adicionales")
          .contains("emails_adicionales", [emailLc])
          .limit(1)
          .maybeSingle();
        if (byExtra?.id) alumnoId = byExtra.id;
      }
    } catch (e) {
      console.warn("[create-public-store-order] match alumno:", (e as Error).message);
    }

    const { data: order, error: orderErr } = await supabase
      .from("store_orders")
      .insert({
        alumno_id: alumnoId,

        customer_name: nombre,
        customer_email: email,
        customer_phone: telefono,
        total: totalArs,
        currency: "ARS",
        status: metodoPago === "efectivo" ? "pendiente_pago_efectivo" : "pendiente_pago",
        metodo_pago: metodoPago === "efectivo" ? "efectivo" : "mp",

        origen_registro: "tienda_publica",
        es_externo: !!product.es_externo,
        entrega_metodo: entrega,
        envio_direccion: entrega === "moto" ? direccion : null,
        envio_contacto: telefono,
        envio_notas: [observaciones, fxNota].filter(Boolean).join(" ") || null,
        envio_estado: entrega === "moto" ? "a_cotizar" : null,
        notes: [observaciones, fxNota].filter(Boolean).join(" ") || null,
      })
      .select("id, order_number")
      .single();

    if (orderErr || !order) {
      console.error("[create-public-store-order] order insert", orderErr);
      return json({ error: "No pudimos crear el pedido" }, 500);
    }

    const { error: itemErr } = await supabase.from("store_order_items").insert({
      order_id: order.id,
      product_id: product.id,
      product_name: product.name,
      quantity: cantidad,
      unit_price: unit,
      variant_selection: variante,
      precio_lista: Number(priceSnapshot.precio_lista),
      precio_cobrado: unit,
      campaign_id: priceSnapshot.campaign_id,
      campaign_nombre: priceSnapshot.campaign_nombre,
      discount_pct: Number(priceSnapshot.descuento_pct || 0),
    });
    if (itemErr) {
      console.error("[create-public-store-order] item insert", itemErr);
      await supabase.from("store_orders").delete().eq("id", order.id);
      return json({ error: "No pudimos crear el detalle del pedido" }, 500);
    }

    // Base de clientes de tienda (segmentación)
    try {
      const { data: existing } = await supabase
        .from("marketing_contacts")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      const [nom, ...rest] = nombre.split(" ");
      if (existing) {
        await supabase
          .from("marketing_contacts")
          .update({ telefono: telefono || null, opt_in_marketing: optIn })
          .eq("id", existing.id);
      } else {
        await supabase.from("marketing_contacts").insert({
          email,
          nombre: nom || nombre,
          apellido: rest.join(" ") || null,
          telefono: telefono || null,
          tipo: "cliente_tienda",
          origen: "tienda_publica",
          tags: ["tienda", "compra_online"],
          opt_in_marketing: optIn,
        });
      }
    } catch (e) {
      console.error("[create-public-store-order] marketing_contacts", e);
    }

    // Efectivo: el pedido queda reservado y pendiente de cobro. No se crea
    // ninguna preferencia ni movimiento de Mercado Pago.
    if (metodoPago === "efectivo") {
      return json({
        order_id: order.id,
        order_number: order.order_number,
        total_ars: totalArs,
        fx_rate: fxRate,
        metodo_pago: "efectivo",
        cash_pending: true,
      });
    }

    // Preferencia MP
    const cuenta = await resolveCuentaMP(supabase, { unidad_negocio: "tienda" });
    if (!cuenta.access_token) return json({ error: "Pagos no disponibles por el momento" }, 500);


    const origin = req.headers.get("origin") || "https://reybaud-app.com";
    const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cuenta.access_token}` },
      body: JSON.stringify({
        items: [{
          title: product.name,
          quantity: cantidad,
          unit_price: unitArs,
          currency_id: "ARS",
        }],
        payer: { name: nombre, email },
        back_urls: {
          success: `${origin}/pago-resultado?status=approved&kind=store_order`,
          failure: `${origin}/pago-resultado?status=failure&kind=store_order`,
          pending: `${origin}/pago-resultado?status=pending&kind=store_order`,
        },
        auto_return: "approved",
        external_reference: `store_order:${order.id}`,
        metadata: { payment_type: "store_order", order_id: order.id },
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook${cuenta.slug ? `?cuenta=${cuenta.slug}` : ""}`,
        statement_descriptor: "CICLISMO REYBAUD",
      }),
    });
    const pref = await prefRes.json();
    if (!prefRes.ok) {
      console.error("[create-public-store-order] MP error", JSON.stringify(pref));
      return json({ error: "No pudimos iniciar el pago", order_number: order.order_number }, 500);
    }

    await supabase
      .from("store_orders")
      .update({ mp_preference_id: pref.id, cuenta_mp_id: cuenta.cuenta_id })
      .eq("id", order.id);

    return json({
      order_id: order.id,
      order_number: order.order_number,
      total_ars: totalArs,
      fx_rate: fxRate,
      init_point: pref.init_point || pref.sandbox_init_point,
    });
  } catch (err) {
    console.error("create-public-store-order error:", err);
    return json({ error: "Error interno" }, 500);
  }
});
