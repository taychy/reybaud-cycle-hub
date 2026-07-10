// Admin aprueba o rechaza un comprobante de transferencia.
// Body: { reservation_id, action: "aprobar"|"rechazar", motivo?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verificar identidad
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Verificar rol admin
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo admins" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reservation_id, action, motivo } = await req.json();
    if (!reservation_id || !["aprobar", "rechazar"].includes(action)) {
      return new Response(JSON.stringify({ error: "Datos inválidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: r } = await supabase
      .from("reservas_turnera")
      .select("id, email, pago_estado")
      .eq("id", reservation_id)
      .maybeSingle();
    if (!r) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "aprobar") {
      await supabase.from("reservas_turnera").update({
        pago_estado: "aprobado",
        verificado_por: uid,
        verificado_at: new Date().toISOString(),
        hold_expira_at: null,
      } as any).eq("id", reservation_id);

      // Emails: confirmación al alumno + coach_aviso
      try {
        await Promise.all([
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ reservation_id, tipo: "transferencia_aprobada" }),
          }),
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ reservation_id, tipo: "coach_aviso" }),
          }),
        ]);
      } catch (e) {
        console.error("[admin-verificar-comprobante] email error:", (e as Error).message);
      }
    } else {
      // rechazar
      await supabase.from("reservas_turnera").update({
        pago_estado: "rechazado",
        motivo_rechazo: motivo || null,
        verificado_por: uid,
        verificado_at: new Date().toISOString(),
        estado_operativo: "cancelada",
      } as any).eq("id", reservation_id);

      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-turnera-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ reservation_id, tipo: "transferencia_rechazada", motivo }),
        });
      } catch (e) {
        console.error("[admin-verificar-comprobante] email error:", (e as Error).message);
      }
    }

    return new Response(JSON.stringify({ ok: true, action }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-verificar-comprobante] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
