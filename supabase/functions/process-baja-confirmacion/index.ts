// Orquesta la confirmación de una baja de alumno:
//  1) Llama a RPC confirm_baja_alumno (cancela subs, pasa alumno a inactivo, audit).
//  2) Cancela los preapprovals MP devueltos por la RPC.
//  3) Si corresponde, encola email al alumno.
//
// Requiere caller admin (la RPC ya valida).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  solicitud_id: string;
  notas?: string;
  email_notificar?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = (await req.json()) as Body;
    if (!body?.solicitud_id) return json({ error: "solicitud_id requerido" }, 400);

    const { data, error } = await supabase.rpc("confirm_baja_alumno", {
      p_solicitud_id: body.solicitud_id,
      p_notas: body.notas ?? null,
      p_email_notificar: body.email_notificar ?? true,
    });
    if (error) return json({ error: error.message }, 400);

    const row = Array.isArray(data) ? data[0] : data;
    const alumnoId: string = row?.alumno_id;
    const preapprovals: string[] = row?.mp_preapproval_ids || [];

    const cancelled: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Cancelar preapprovals MP (best-effort)
    for (const preapprovalId of preapprovals.filter(Boolean)) {
      try {
        const res = await supabase.functions.invoke("cancel-mp-preapproval", {
          body: { preapproval_id: preapprovalId },
        });
        if (res.error) failed.push({ id: preapprovalId, error: res.error.message });
        else cancelled.push(preapprovalId);
      } catch (e) {
        failed.push({ id: preapprovalId, error: (e as Error).message });
      }
    }

    // Email opt-in (best-effort)
    if (body.email_notificar !== false) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: alumno } = await admin
          .from("alumnos")
          .select("email, nombre, apellido")
          .eq("id", alumnoId)
          .maybeSingle();
        if (alumno?.email) {
          await admin.rpc("enqueue_email", {
            queue_name: "emails_default",
            payload: {
              kind: "baja_confirmada",
              to: alumno.email,
              subject: "Baja procesada",
              context: {
                nombre: alumno.nombre,
                apellido: alumno.apellido,
              },
            },
          });
        }
      } catch (e) {
        console.warn("[process-baja-confirmacion] email warn:", (e as Error).message);
      }
    }

    return json({ ok: true, alumno_id: alumnoId, mp_cancelled: cancelled, mp_failed: failed });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
