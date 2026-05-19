import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AlumnoIncompleto {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  obra_social_nombre: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional dry-run flag
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = !!body?.dry_run;
    } catch { /* no body */ }

    // 1) Alumnos activos con datos incompletos (creados hace >30 días)
    const { data: alumnos, error: aErr } = await supabase
      .from("alumnos")
      .select(
        "id, nombre, apellido, email, contacto_emergencia_nombre, contacto_emergencia_telefono, obra_social_nombre, created_at",
      )
      .eq("estado", "activo")
      .lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    if (aErr) throw aErr;

    // Cargar familiares para chequear presencia
    const { data: familiares } = await supabase
      .from("alumno_familiares")
      .select("alumno_id");
    const conFamiliar = new Set((familiares || []).map((f: any) => f.alumno_id));

    const incompletos = (alumnos as AlumnoIncompleto[] || []).map((a) => {
      const faltaEmergencia = !a.contacto_emergencia_nombre || !a.contacto_emergencia_telefono;
      const faltaObra = !a.obra_social_nombre;
      const faltaFamilia = !conFamiliar.has(a.id);
      return { a, faltaEmergencia, faltaObra, faltaFamilia };
    }).filter((x) => x.faltaEmergencia || x.faltaObra || x.faltaFamilia);

    if (incompletos.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: 0, message: "Sin alumnos con datos incompletos" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Admins activos
    const { data: admins, error: adErr } = await supabase
      .from("admin_profiles")
      .select("email, full_name")
      .eq("status", "active");
    if (adErr) throw adErr;

    const recipients = (admins || []).map((x: any) => x.email).filter(Boolean);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: incompletos.length, sent: 0, message: "Sin admins activos" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Render HTML
    const rows = incompletos
      .sort((x, y) => `${x.a.nombre} ${x.a.apellido || ""}`.localeCompare(`${y.a.nombre} ${y.a.apellido || ""}`))
      .map(({ a, faltaEmergencia, faltaObra, faltaFamilia }) => {
        const faltantes = [
          faltaEmergencia ? "Emergencia" : null,
          faltaObra ? "Obra social" : null,
          faltaFamilia ? "Familia" : null,
        ].filter(Boolean).join(" · ");
        const nombre = `${a.nombre} ${a.apellido || ""}`.trim();
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;">
              <a href="https://reybaud-cycle-hub.lovable.app/admin/alumnos?focus=${a.id}" style="color:#d4820a;text-decoration:none;font-weight:600;">${nombre}</a>
              <div style="color:#888;font-size:11px;">${a.email}</div>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;font-size:13px;">${faltantes}</td>
          </tr>`;
      }).join("");

    const subject = `📋 Alumnos con datos incompletos (${incompletos.length})`;
    const emailHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;">
        <h2 style="color:#d4820a;margin-bottom:8px;">📋 Datos personales incompletos</h2>
        <p style="color:#333;margin:0 0 16px;">
          Hay <strong>${incompletos.length}</strong> alumno${incompletos.length === 1 ? "" : "s"} activo${incompletos.length === 1 ? "" : "s"} con datos faltantes
          de contacto de emergencia, obra social o familiares.
        </p>
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #eee;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f1f1f1;text-align:left;">
              <th style="padding:10px 12px;font-size:12px;color:#666;text-transform:uppercase;">Alumno</th>
              <th style="padding:10px 12px;font-size:12px;color:#666;text-transform:uppercase;">Falta</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="text-align:center;margin-top:24px;">
          <a href="https://reybaud-cycle-hub.lovable.app/admin/alumnos" style="display:inline-block;padding:12px 28px;background:#d4820a;color:white;text-decoration:none;border-radius:8px;font-weight:600;">
            Ver alumnos
          </a>
        </div>
        <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">
          Ciclismo Reybaud — Resumen automático
        </p>
      </div>`;

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dry_run: true, count: incompletos.length, recipients }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY no configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
        to: recipients,
        subject,
        html: emailHtml,
      }),
    });

    const resJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error", resJson);
      return new Response(
        JSON.stringify({ ok: false, error: resJson }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, count: incompletos.length, sent_to: recipients.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
