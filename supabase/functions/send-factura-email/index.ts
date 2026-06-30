// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SENDER_DOMAIN = "notify.reybaud-app.com";
const FROM_NAME = "Ciclismo Reybaud";
const APP_PORTAL_URL = "https://reybaud-app.com";
const BRAND = "#FF6B1A";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
async function getOrCreateUnsubscribeToken(supabase: any, email: string): Promise<string> {
  const e = normalizeEmail(email);
  const { data: ex } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (ex?.token) return ex.token;
  const t = crypto.randomUUID();
  const { data: ins, error } = await supabase.from('email_unsubscribe_tokens').insert({ email: e, token: t }).select('token').single();
  if (!error && ins?.token) return ins.token;
  const { data: fb } = await supabase.from('email_unsubscribe_tokens').select('token').eq('email', e).maybeSingle();
  if (fb?.token) return fb.token;
  throw error ?? new Error('Could not create unsubscribe token');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { factura_id } = await req.json();
    if (!factura_id) return json({ error: "factura_id requerido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: factura } = await supabase
      .from("facturas").select("*").eq("id", factura_id).single();
    if (!factura) return json({ error: "Factura no encontrada" }, 404);
    if (!factura.alumno_id) return json({ error: "Factura sin alumno" }, 400);

    const { data: alumno } = await supabase
      .from("alumnos").select("nombre, apellido, email").eq("id", factura.alumno_id).single();
    if (!alumno?.email) return json({ error: "Alumno sin email" }, 400);

    const { data: emisor } = factura.emisor_id
      ? await supabase.from("emisores_fiscales").select("nombre_fiscal, telefono_contacto")
          .eq("id", factura.emisor_id).single()
      : { data: null } as any;

    // Ensure PDF exists
    let pdfPath = factura.pdf_path;
    if (!pdfPath) {
      const genUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-factura-pdf`;
      const resp = await fetch(genUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ factura_id }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) return json({ error: data.error || "PDF fail" }, 500);
      pdfPath = data.path;
    }

    const { data: signed } = await supabase.storage.from("facturas-pdf")
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
    const pdfUrl = signed?.signedUrl || "";

    const monto = formatMoney(Number(factura.monto || 0), factura.moneda || "ARS");
    const wa = emisor?.telefono_contacto?.replace(/\D/g, "") || "";

    const html = renderEmail({
      nombre: alumno.nombre,
      numero: factura.numero_comprobante || "—",
      concepto: factura.concepto,
      monto,
      cae: factura.cae || "",
      pdfUrl,
      portalUrl: APP_PORTAL_URL,
      whatsappUrl: wa ? `https://wa.me/${wa}` : "",
    });

    const messageId = crypto.randomUUID();
    const subject = `Tu factura ${factura.numero_comprobante || ""} de Reybaud Ciclismo`.trim();

    const unsubToken = await getOrCreateUnsubscribeToken(supabase, alumno.email);

    const { error: enqueueErr } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: alumno.email,
        from: `${FROM_NAME} <noreply@${SENDER_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: "",
        purpose: "transactional",
        label: "factura_emitida",
        idempotency_key: `factura-${factura_id}`,
        queued_at: new Date().toISOString(),
        unsubscribe_token: unsubToken,
      },
    });
    if (enqueueErr) {
      console.error("enqueue error", enqueueErr);
      return json({ error: enqueueErr.message }, 500);
    }

    await supabase.from("facturas")
      .update({ email_enviado_at: new Date().toISOString() } as any)
      .eq("id", factura_id);

    return json({ ok: true });
  } catch (e) {
    console.error("send-factura-email error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatMoney(n: number, m: string) {
  const sym = m === "USD" ? "US$ " : m === "EUR" ? "€ " : "$ ";
  return sym + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderEmail(d: {
  nombre: string; numero: string; concepto: string; monto: string;
  cae: string; pdfUrl: string; portalUrl: string; whatsappUrl: string;
}): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="border-top:4px solid ${BRAND};padding-top:24px;">
      <h1 style="font-size:22px;margin:0 0 8px;color:#1a1a1a;">¡Gracias, ${escapeHtml(d.nombre)}!</h1>
      <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.5;">
        Adjuntamos tu factura electrónica emitida por Ciclismo Reybaud.
      </p>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#777;">Factura</td><td style="padding:6px 0;font-weight:600;text-align:right;">${escapeHtml(d.numero)}</td></tr>
          <tr><td style="padding:6px 0;color:#777;">Concepto</td><td style="padding:6px 0;text-align:right;">${escapeHtml(d.concepto)}</td></tr>
          <tr><td style="padding:6px 0;color:#777;">Total</td><td style="padding:6px 0;font-weight:700;color:${BRAND};text-align:right;">${escapeHtml(d.monto)}</td></tr>
          ${d.cae ? `<tr><td style="padding:6px 0;color:#777;">CAE</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px;">${escapeHtml(d.cae)}</td></tr>` : ""}
        </table>
      </div>

      <div style="text-align:center;margin:28px 0;">
        <a href="${d.pdfUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:14px;">Descargar PDF</a>
      </div>

      <p style="font-size:13px;color:#666;line-height:1.6;margin:24px 0 0;">
        Podés ver todos tus pagos y facturas en el portal:
        <a href="${d.portalUrl}" style="color:${BRAND};font-weight:600;text-decoration:none;">${d.portalUrl.replace(/^https?:\/\//, "")}</a>
      </p>
      ${d.whatsappUrl ? `<p style="font-size:13px;color:#666;margin:8px 0 0;">¿Dudas? Escribinos por <a href="${d.whatsappUrl}" style="color:${BRAND};font-weight:600;text-decoration:none;">WhatsApp</a>.</p>` : ""}

      <hr style="border:0;border-top:1px solid #eee;margin:32px 0 16px;" />
      <p style="font-size:11px;color:#999;margin:0;">El enlace al PDF es válido por 30 días. Si caduca, podés solicitar uno nuevo desde la app.</p>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}
