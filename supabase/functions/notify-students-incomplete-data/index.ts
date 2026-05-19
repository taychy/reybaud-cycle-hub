import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Alumno {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  obra_social_nombre: string | null;
  created_at: string;
}

function buildHtml(opts: {
  nombre: string;
  faltaEmergencia: boolean;
  faltaObra: boolean;
  faltaFamilia: boolean;
}) {
  const items: string[] = [];
  if (opts.faltaEmergencia) {
    items.push(
      `<li style="margin-bottom:8px;"><strong>Contacto de emergencia</strong> — nombre y teléfono de alguien a quien podamos llamar ante una urgencia.</li>`,
    );
  }
  if (opts.faltaObra) {
    items.push(
      `<li style="margin-bottom:8px;"><strong>Obra social o prepaga</strong> — nombre y número de socio para tenerlo a mano si lo necesitamos.</li>`,
    );
  }
  if (opts.faltaFamilia) {
    items.push(
      `<li style="margin-bottom:8px;"><strong>Familiares en la escuela</strong> — vinculá a tus familiares que también entrenan con nosotros.</li>`,
    );
  }
  const lista = items.join("");

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222;">
    <h2 style="color:#d4820a;margin:0 0 12px;">Hola ${opts.nombre} 👋</h2>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      Estamos completando las fichas de todos los alumnos de Ciclismo Reybaud y notamos que en la tuya
      faltan algunos datos importantes. Son rápidos de cargar y nos ayudan a cuidarte mejor.
    </p>
    <div style="background:#fff8ef;border:1px solid #f0d8b4;border-radius:10px;padding:16px 20px;margin:18px 0;">
      <p style="margin:0 0 10px;font-weight:600;color:#8a5200;">Te pedimos completar:</p>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;color:#333;">${lista}</ul>
    </div>
    <div style="text-align:center;margin:26px 0;">
      <a href="https://reybaud-cycle-hub.lovable.app/alumno?tab=more"
        style="display:inline-block;padding:13px 30px;background:#d4820a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
        Completar mis datos
      </a>
    </div>
    <p style="font-size:13px;color:#666;line-height:1.5;margin:18px 0 0;">
      Te toma menos de 2 minutos. Si ya los cargaste, podés ignorar este mensaje 🙌
    </p>
    <p style="font-size:12px;color:#999;text-align:center;margin-top:28px;">
      Ciclismo Reybaud · Este es un recordatorio automático
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let dryRun = false;
    let testRecipient: string | null = null;
    try {
      const body = await req.json();
      dryRun = !!body?.dry_run;
      if (typeof body?.test_recipient === "string") testRecipient = body.test_recipient;
    } catch { /* no body */ }

    // Alumnos activos con datos incompletos
    const { data: alumnos, error: aErr } = await supabase
      .from("alumnos")
      .select(
        "id, nombre, apellido, email, contacto_emergencia_nombre, contacto_emergencia_telefono, obra_social_nombre, created_at",
      )
      .eq("estado", "activo")
      .lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    if (aErr) throw aErr;

    const { data: familiares } = await supabase
      .from("alumno_familiares")
      .select("alumno_id");
    const conFamiliar = new Set((familiares || []).map((f: any) => f.alumno_id));

    const incompletos = (alumnos as Alumno[] || []).map((a) => {
      const faltaEmergencia = !a.contacto_emergencia_nombre || !a.contacto_emergencia_telefono;
      const faltaObra = !a.obra_social_nombre;
      const faltaFamilia = !conFamiliar.has(a.id);
      return { a, faltaEmergencia, faltaObra, faltaFamilia };
    }).filter((x) => (x.faltaEmergencia || x.faltaObra || x.faltaFamilia) && x.a.email);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY no configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Modo prueba: enviar UN solo email al test_recipient con datos de ejemplo
    if (testRecipient) {
      const sample = incompletos[0];
      const html = buildHtml({
        nombre: sample ? sample.a.nombre : "Scarlett",
        faltaEmergencia: sample?.faltaEmergencia ?? true,
        faltaObra: sample?.faltaObra ?? true,
        faltaFamilia: sample?.faltaFamilia ?? true,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
          to: [testRecipient],
          subject: "📝 Completá tus datos en Ciclismo Reybaud",
          html,
        }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, error: resJson }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, test: true, sent_to: testRecipient, total_incompletos: incompletos.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true, count: incompletos.length,
        sample: incompletos.slice(0, 5).map((x) => ({ email: x.a.email, nombre: x.a.nombre })),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Envío real: un mail por alumno
    let sent = 0;
    let failed = 0;
    const errors: any[] = [];
    for (const { a, faltaEmergencia, faltaObra, faltaFamilia } of incompletos) {
      const html = buildHtml({
        nombre: a.nombre,
        faltaEmergencia, faltaObra, faltaFamilia,
      });
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Ciclismo Reybaud <no-reply@ciclismoreybaud.com>",
            to: [a.email],
            subject: "📝 Completá tus datos en Ciclismo Reybaud",
            html,
          }),
        });
        if (res.ok) sent++;
        else {
          failed++;
          errors.push({ email: a.email, error: await res.text() });
        }
        // pequeño delay para evitar rate-limit
        await new Promise((r) => setTimeout(r, 120));
      } catch (e) {
        failed++;
        errors.push({ email: a.email, error: String(e) });
      }
    }

    return new Response(JSON.stringify({
      ok: true, total: incompletos.length, sent, failed, errors: errors.slice(0, 10),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
