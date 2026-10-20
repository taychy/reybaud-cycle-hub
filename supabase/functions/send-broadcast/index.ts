// Send broadcast emails via Brevo connector gateway.
// Modes: "test" (single recipient) or "send" (all targeted recipients).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { evaluateRecipients, frequencyPolicy, canonical } from "../_shared/broadcastPolicy.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function allRows(query: any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const {data,error} = await query.range(offset, offset + 999);
    if(error) throw error;
    rows.push(...(data || []));
    if((data || []).length < 1000) return rows;
  }
}
async function digest(value: unknown) {
 const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function campaignPayload(body: SendBody) {
 return {subject:body.subject,content_html:body.content_html,preheader:body.preheader||'',filters:body.segment_filters||{},cta_url:body.cta_url||'',cta_label:body.cta_label||'',promo:body.promo_product_ids||[],excluded:(body.excluded_emails||[]).map(e=>e.trim().toLowerCase()).sort()};
}
async function unsubscribeUrl(admin: any,email: string) {
 const {data,error}=await admin.rpc('issue_broadcast_unsubscribe',{p_email:email});
 if(error || !data) throw error || new Error('No se pudo crear el enlace de baja');
 return `${PUBLIC_ORIGIN}/baja-mailing#${data}`;
}

interface SegmentFilters {
  audience?: ("students" | "coaches" | "marketing" | "waitlist")[];
  estados?: string[];
  sede_ids?: string[];
  grupos?: string[];
  plan_ids?: string[];
  has_email_only?: boolean;
  alumno_ids?: string[];
  coach_ids?: string[];
  // marketing
  marketing_tipos?: string[];          // ['lead','ex_alumno',...]
  marketing_tags?: string[];           // tags a matchear (OR)
  marketing_contact_ids?: string[];    // selección puntual
  marketing_ignore_frequency?: boolean;
  // waitlist
  waitlist_event_ids?: string[];       // eventos cuyas listas de espera se incluyen
  waitlist_estados?: string[];         // nuevo | contactado | convertido | descartado
  marketing_include_opt_out?: boolean;
  marketing_frequency_days?: number;
  marketing_frequency_reason?: string;
}

interface SendBody {
  mode: "test" | "send" | "preview_count" | "retry_failed";
  test_email?: string;
  broadcast_id?: string;
  subject?: string;
  content_html?: string;
  preheader?: string;
  segment_filters?: SegmentFilters;
  sender_email?: string;
  sender_name?: string;
  reply_to?: string;
  save_as?: "draft" | "sent";
  cta_url?: string;
  cta_label?: string;
  excluded_emails?: string[];
  include_full_list?: boolean;
  promo_product_ids?: string[];
  preview_id?: string;
  confirmed?: boolean;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkifyPlain(escaped: string) {
  // markdown [text](url) — url puede contener caracteres ya escapados
  let out = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, url) => `<a href="${url}" style="color:#F08A2A;text-decoration:underline">${text}</a>`,
  );
  // URLs sueltas (que no estén ya dentro de un href)
  out = out.replace(
    /(^|[^"'>])(https?:\/\/[^\s<)]+)/g,
    (_m, pre, url) => `${pre}<a href="${url}" style="color:#F08A2A;text-decoration:underline">${url}</a>`,
  );
  return out;
}

const PUBLIC_ORIGIN = "https://reybaud-app.com";

function fmtMoney(n: number, currency = "ARS") {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("es-AR")}`;
  }
}

// Bloque discreto de productos en promoción al pie del mail.
function buildPromoBlock(products: any[]) {
  if (!products?.length) return "";
  const cards = products.slice(0, 4).map((p) => {
    const url = `${PUBLIC_ORIGIN}/tienda/producto/${p.id}`;
    const img = p.image_url
      ? `<img src="${p.image_url}" width="64" height="64" alt="${escapeHtml(p.name)}" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px"/>`
      : "";
    const old = p.old_price
      ? `<span style="color:#777;text-decoration:line-through;font-size:12px;margin-right:6px">${fmtMoney(Number(p.old_price), p.currency || "ARS")}</span>`
      : "";
    return `<tr>
      <td width="64" style="padding:8px 12px 8px 0;vertical-align:top">${img}</td>
      <td style="padding:8px 0;vertical-align:top">
        <a href="${url}" style="color:#e8e8e8;text-decoration:none;font-size:13px;font-weight:600">${escapeHtml(p.name)}</a>
        <div style="margin-top:2px">${old}<span style="color:#F08A2A;font-size:13px;font-weight:700">${fmtMoney(Number(p.price), p.currency || "ARS")}</span></div>
      </td>
    </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #262626">
    <tr><td style="padding:16px 0 4px;color:#777;font-size:11px;letter-spacing:2px;text-transform:uppercase">También en la tienda</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table></td></tr>
    <tr><td style="padding:10px 0 0"><a href="${PUBLIC_ORIGIN}/tienda" style="color:#F08A2A;font-size:12px;text-decoration:underline">Ver toda la tienda</a></td></tr>
  </table>`;
}

async function loadPromoProducts(admin: any, ids?: string[] | null) {
  if (!ids?.length) return [];
  const { data } = await admin
    .from("store_products")
    .select("id, name, price, old_price, currency, image_url")
    .in("id", ids)
    .eq("status", "active");
  const order = new Map(ids.map((id, i) => [id, i]));
  return (data || []).sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function htmlWrap(content: string, preheader?: string, cta?: { url?: string; label?: string }, promoHtml = "", unsubscribe = "") {
  const safe = content.includes("<") && content.includes(">")
    ? content
    : linkifyPlain(escapeHtml(content)).replace(/\n/g, "<br/>");
  const pre = preheader
    ? `<div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</div>`
    : "";
  const ctaBlock = cta?.url
    ? `<div style="text-align:center;padding:24px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#F08A2A;color:#0a0a0a;padding:14px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-family:Inter,Arial,sans-serif">${escapeHtml(cta.label || "Ver más")}</a></div>`
    : "";
  const bodyHtml = `<div style="font-size:15px;line-height:1.6;color:#e8e8e8">${safe}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#121212;font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e8e8e8">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a1a1a;border-radius:14px;overflow:hidden;border:1px solid #262626">
      <tr><td style="padding:28px 32px 20px;text-align:left;border-bottom:1px solid #262626">
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;letter-spacing:4px;color:#F08A2A;font-weight:800">REYBAUD</div>
      </td></tr>
      <tr><td style="padding:28px 32px 12px">${bodyHtml}${ctaBlock}${promoHtml}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #262626;color:#666;font-size:11px;text-align:center;line-height:1.6">
        Recibís este email porque sos parte de Reybaud.<br/>
        ${unsubscribe ? `<a href="${escapeHtml(unsubscribe)}" style="color:#aaa;text-decoration:underline">Dejar de recibir comunicaciones</a>` : "Vista previa: el correo llevará un enlace individual de baja."}
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function encodeUrlValue(value: unknown) {
  return encodeURIComponent(String(value ?? ""));
}

function personalize(value: string | undefined, recipient: any) {
  if (!value) return value;
  const nombre = recipient?.display_name || `${recipient?.nombre ?? ""} ${recipient?.apellido ?? ""}`.trim();
  const email = recipient?.email || "";
  return value
    .replaceAll("{nombre_url}", encodeUrlValue(nombre))
    .replaceAll("{email_url}", encodeUrlValue(email))
    .replaceAll("{nombre}", nombre)
    .replaceAll("{email}", email);
}

async function loadRecipients(supabase: any, filters: SegmentFilters, excluded: string[] = []) {
  // Selección puntual por tipo: se suma al segmento amplio marcado.
  // Ej: alumnos activos + Claudio puntual = ambos conjuntos, deduplicados por email.
  const explicitAlumnos = Boolean(filters.alumno_ids?.length);
  const explicitCoaches = Boolean(filters.coach_ids?.length);
  const explicitMarketing = Boolean(filters.marketing_contact_ids?.length);
  const audience = Array.isArray(filters.audience) ? filters.audience : ["students"];
  let rows: any[] = [];

  // --- ALUMNOS ---
  if (audience.includes("students")) {
    let q = supabase.from("alumnos").select("id, nombre, apellido, email, estado, sede_id, grupo");
    if (filters.estados?.length) q = q.in("estado", filters.estados);
    if (filters.sede_ids?.length) q = q.in("sede_id", filters.sede_ids);
    if (filters.grupos?.length) q = q.in("grupo", filters.grupos);
    const data = await allRows(q.order("id"));
    rows.push(...(data || []).map((a: any) => ({
      ...a,
      contact_type: "alumno",
      display_name: `${a.nombre ?? ""} ${a.apellido ?? ""}`.trim(),
    })));
  }
  if (explicitAlumnos) {
    const { data, error } = await supabase
      .from("alumnos")
      .select("id, nombre, apellido, email, estado, sede_id, grupo")
      .in("id", filters.alumno_ids || []);
    if (error) throw error;
    rows.push(...(data || []).map((a: any) => ({
      ...a,
      contact_type: "alumno",
      display_name: `${a.nombre ?? ""} ${a.apellido ?? ""}`.trim(),
    })));
  }

  // --- COACHES ---
  if (audience.includes("coaches")) {
    let q = supabase.from("coaches").select("id, nombre, email, estado, sede_id, grupos");
    if (filters.estados?.length) q = q.in("estado", filters.estados);
    if (filters.sede_ids?.length) q = q.in("sede_id", filters.sede_ids);
    if (filters.grupos?.length) q = q.overlaps("grupos", filters.grupos);
    const data = await allRows(q.order("id"));
    rows.push(...(data || []).map((c: any) => ({
      ...c,
      contact_type: "coach",
      display_name: c.nombre,
    })));
  }
  if (explicitCoaches) {
    const { data, error } = await supabase
      .from("coaches")
      .select("id, nombre, email, estado, sede_id, grupos")
      .in("id", filters.coach_ids || []);
    if (error) throw error;
    rows.push(...(data || []).map((c: any) => ({
      ...c,
      contact_type: "coach",
      display_name: c.nombre,
    })));
  }

  // --- MARKETING CONTACTS ---
  if (audience.includes("marketing")) {
    let q = supabase.from("marketing_contacts").select(
      "id, email, nombre, apellido, tipo, tags, opt_in_marketing, last_campaign_sent_at"
    );
    
    if (filters.marketing_tipos?.length) q = q.in("tipo", filters.marketing_tipos);
    if (filters.marketing_tags?.length) q = q.overlaps("tags", filters.marketing_tags);
    const data = await allRows(q.order('id'));
    rows.push(...(data || []).map((m: any) => ({
      id: m.id,
      email: m.email,
      nombre: m.nombre,
      apellido: m.apellido,
      contact_type: "marketing",
      marketing_tipo: m.tipo,
      display_name: `${m.nombre ?? ""} ${m.apellido ?? ""}`.trim() || m.email,
    })));
  }
  if (explicitMarketing) {
    let q = supabase
      .from("marketing_contacts")
      .select("id, email, nombre, apellido, tipo, tags, opt_in_marketing, last_campaign_sent_at")
      .in("id", filters.marketing_contact_ids || []);
    // Un contacto elegido a mano NO puede saltear la baja.
    
    const data = await allRows(q.order("id"));

    rows.push(...(data || []).map((m: any) => ({
      id: m.id,
      email: m.email,
      nombre: m.nombre,
      apellido: m.apellido,
      contact_type: "marketing",
      marketing_tipo: m.tipo,
      display_name: `${m.nombre ?? ""} ${m.apellido ?? ""}`.trim() || m.email,
    })));
  }

  // --- LISTAS DE ESPERA ---
  if (audience.includes("waitlist")) {
    let q = supabase
      .from("event_waitlist_entries")
      .select("id, event_id, nombre, email, estado");
    if (filters.waitlist_event_ids?.length) q = q.in("event_id", filters.waitlist_event_ids);
    if (filters.waitlist_estados?.length) q = q.in("estado", filters.waitlist_estados);
    const data = await allRows(q.order("id"));
    rows.push(...(data || []).map((w: any) => ({
      id: w.id,
      email: w.email,
      nombre: w.nombre,
      contact_type: "waitlist",
      event_id: w.event_id,
      display_name: w.nombre || w.email,
    })));
  }

  const [sup, outs, campaigns, marketing] = await Promise.all([
    allRows(supabase.from('suppressed_emails').select('email').order('id')),
    allRows(supabase.from('marketing_contacts').select('email').or('opt_in_marketing.eq.false,opt_in_marketing.is.null').order('id')),
    allRows(supabase.from('broadcast_recipients').select('email,sent_at').eq('status','sent').order('id')),
    allRows(supabase.from('marketing_contacts').select('email,last_campaign_sent_at').order('id')),
  ]);
  const last = new Map<string,string>();
  for(const row of [...campaigns,...marketing]) {
    const email = String(row.email||'').trim().toLowerCase();
    const date = row.sent_at || row.last_campaign_sent_at;
    if(date && (!last.has(email) || Date.parse(date)>Date.parse(last.get(email)||''))) last.set(email,date);
  }
  const priority: Record<string,number> = {alumno:0,coach:1,waitlist:2,marketing:3};
  rows.sort((a,b)=>(priority[a.contact_type]??9)-(priority[b.contact_type]??9));
  return evaluateRecipients(rows,new Set(sup.map(r=>r.email.trim().toLowerCase())),new Set(outs.map(r=>r.email.trim().toLowerCase())),last,frequencyPolicy(filters),new Set(excluded.map(e=>e.trim().toLowerCase())));
}

async function sendOne(payload: any) {

  const resp = await fetch(`${GATEWAY_URL}/smtp/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": BREVO_API_KEY || "",
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  console.log("[brevo] response", resp.status, text.slice(0, 500));
  const ok = resp.ok && !!(json && (json.messageId || json.messageIds));
  return { ok, status: resp.status, body: json ?? text };
}

// Ambiguous outcomes are never retried automatically: manual provider reconciliation first.
async function sendWithRetries(payload: any) {
 try { return {...await sendOne(payload),attempts:1}; }
 catch(e) { return {ok:false,status:0,body:`Resultado desconocido: ${(e as Error).message}`,attempts:1}; }
}
async function claimRecipient(admin: any,broadcast: string,email: string) {
 const {data,error}=await admin.rpc('claim_broadcast_recipient',{p_broadcast:broadcast,p_email:email});
 if(error) throw error;
 return data === true;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY || !BREVO_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY or BREVO_API_KEY" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const schema = z.object({
      mode:z.enum(['test','send','preview_count','retry_failed']),subject:z.string().max(300).optional(),content_html:z.string().max(200000).optional(),
      preheader:z.string().max(500).optional(),test_email:z.string().trim().email().optional(),preview_id:z.string().uuid().optional(),broadcast_id:z.string().uuid().optional(),confirmed:z.boolean().optional(),
      segment_filters:z.object({audience:z.array(z.enum(['students','coaches','marketing','waitlist'])).optional(),marketing_include_opt_out:z.literal(false).optional(),marketing_frequency_days:z.number().int().min(1).max(365).optional(),marketing_ignore_frequency:z.boolean().optional(),marketing_frequency_reason:z.string().max(1000).optional(),estados:z.array(z.string().max(50)).max(30).optional(),sede_ids:z.array(z.string().uuid()).optional(),grupos:z.array(z.string().max(80)).max(30).optional(),plan_ids:z.array(z.string().uuid()).optional(),alumno_ids:z.array(z.string().uuid()).optional(),coach_ids:z.array(z.string().uuid()).optional(),marketing_contact_ids:z.array(z.string().uuid()).optional(),marketing_tipos:z.array(z.string().max(50)).max(30).optional(),marketing_tags:z.array(z.string().max(100)).max(100).optional(),waitlist_event_ids:z.array(z.string().uuid()).optional(),waitlist_estados:z.array(z.string().max(50)).max(10).optional(),cta_url:z.string().url().optional(),cta_label:z.string().max(200).optional(),has_email_only:z.boolean().optional()}).strict().optional(),
      excluded_emails:z.array(z.string().email()).max(10000).optional(),promo_product_ids:z.array(z.string().uuid()).max(4).optional(),cta_url:z.string().url().refine(v=>v.startsWith('https://')).optional(),cta_label:z.string().max(200).optional(),include_full_list:z.boolean().optional(),
      sender_email:z.string().email().optional(),sender_name:z.string().max(100).optional(),reply_to:z.string().email().optional()
    });
    const parsed=schema.safeParse(await req.json());
    if(!parsed.success) return new Response(JSON.stringify({error:'Parámetros inválidos',details:parsed.error.flatten()}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const body: SendBody = parsed.data;
    frequencyPolicy(body.segment_filters || {});
    const filters = body.segment_filters || {};

    let senderEmail = body.sender_email;
    let senderName = body.sender_name;
    let replyTo = body.reply_to;
    if (!senderEmail || !senderName) {
      const { data: cfg } = await admin.from("broadcast_sender_config").select("*").limit(1).maybeSingle();
      senderEmail = senderEmail || cfg?.sender_email || "news@reybaud-app.com";
      senderName = senderName || cfg?.sender_name || "Reybaud";
      replyTo = replyTo || cfg?.reply_to || undefined;
    }

    

    if (body.mode === "preview_count") {
      const selection = await loadRecipients(admin, filters, body.excluded_emails);
      const filtered = selection.eligible;
      const payloadHash=await digest(campaignPayload(body));
      const audienceHash=await digest(filtered.map(r=>r.email).sort());
      const {data:guard,error:guardError}=await admin.from('broadcast_send_guards').insert({actor_id:user.id,payload_hash:payloadHash,audience_hash:audienceHash,eligible_count:filtered.length}).select('id').single();
      if(guardError) throw guardError;
      const mapped = filtered.map((r: any) => ({
        email: r.email,
        nombre: r.display_name || `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim(),
        type: r.contact_type,
      }));
      return new Response(JSON.stringify({
        count: filtered.length,
        preview_id: guard.id,
        excluded_count: selection.rejected.length,
        excluded_summary: selection.rejected.reduce((acc:Record<string,number>,r)=>({...acc,[r.reason]:(acc[r.reason]||0)+1}),{}),
        exclusions: body.include_full_list ? selection.rejected : undefined,
        sample: mapped.slice(0, 5),
        recipients: body.include_full_list ? mapped : undefined,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.mode === "test") {
      if (!body.test_email || !body.subject || !body.content_html) {
        return new Response(JSON.stringify({ error: "Faltan test_email, subject o content_html" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if(!body.preview_id) throw new Error('Calculá destinatarios antes de enviar la prueba');
      const {data:guard,error:ge}=await admin.from('broadcast_send_guards').select('*').eq('id',body.preview_id).eq('actor_id',user.id).single();
      if(ge || !guard || guard.payload_hash!==await digest(campaignPayload(body)) || Date.parse(guard.created_at)<Date.now()-1800000) throw new Error('Vista previa desactualizada');
      const testSuppressed=await allRows(admin.from('suppressed_emails').select('email').order('id'));
      const testOut=await allRows(admin.from('marketing_contacts').select('email').or('opt_in_marketing.eq.false,opt_in_marketing.is.null').order('id'));
      if([...testSuppressed,...testOut].some(r=>r.email.trim().toLowerCase()===body.test_email?.trim().toLowerCase())) throw new Error('El destinatario de prueba está dado de baja o suprimido');
      const testRecipient = { email: body.test_email, display_name: "Test Reybaud" };
      const promoHtml = buildPromoBlock(await loadPromoProducts(admin, body.promo_product_ids));
      const html = htmlWrap(
        personalize(body.content_html, testRecipient) || "",
        body.preheader,
        { url: personalize(body.cta_url, testRecipient), label: body.cta_label },
        promoHtml,
        await unsubscribeUrl(admin,body.test_email),
      );
      const r = await sendOne({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: body.test_email }],
        replyTo: replyTo ? { email: replyTo } : undefined,
        subject: `[TEST] ${body.subject}`,
        htmlContent: html,
      });
      if(r.ok) {
        const {error:te}=await admin.from('broadcast_send_guards').update({test_accepted_at:new Date().toISOString(),test_message_id:r.body?.messageId||null}).eq('id',guard.id);
        if(te) throw te;
      }
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, response: r.body }), {
        status: r.ok ? 200 : r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "send") {
      if (!body.subject || !body.content_html) {
        return new Response(JSON.stringify({ error: "Faltan subject o content_html" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if(!body.confirmed || !body.preview_id) throw new Error('Falta confirmación y vista previa');
      const selection=await loadRecipients(admin,filters,body.excluded_emails);
      const recipients=selection.eligible;
      if (!recipients.length) throw new Error('Sin destinatarios');
      const promoHtml = buildPromoBlock(await loadPromoProducts(admin, body.promo_product_ids));
      const {data:prepared,error:prepareError}=await admin.rpc('prepare_broadcast_send',{
        p_guard:body.preview_id,p_actor:user.id,p_payload:await digest(campaignPayload(body)),p_audience:await digest(recipients.map(r=>r.email).sort()),
        p_campaign:{subject:body.subject,content_html:body.content_html,preheader:body.preheader,sender_email:senderEmail,sender_name:senderName,reply_to:replyTo,segment_filters:filters,promo_product_ids:body.promo_product_ids||[]},p_recipients:recipients
      });
      if(prepareError || !prepared) throw prepareError || new Error('No se pudo preparar el envío');
      const bc={id:prepared.id};
      if(prepared.duplicate) return new Response(JSON.stringify({ok:true,broadcast_id:bc.id,duplicate:true,total:recipients.length}),{headers:{...corsHeaders,'Content-Type':'application/json'}});

      // Ejecutar el envío en background para evitar el timeout de 150s.
      const processBroadcast = async () => {
        let sent = 0, failed = 0;
        const marketingSentEmails: string[] = [];
        const BATCH_SIZE = 8;

        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
          const batch = recipients.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (r: any) => {
            if(!await claimRecipient(admin,bc.id,r.email)) {
              await admin.from('broadcast_recipients').update({status:'suppressed',error_message:'Baja/supresión o envío ya reclamado'}).eq('broadcast_id',bc.id).eq('email',r.email).eq('status','pending');
              return;
            }
            const html = htmlWrap(
              personalize(body.content_html, r) || "",
              body.preheader,
              { url: personalize(body.cta_url, r), label: body.cta_label },
              promoHtml,
              await unsubscribeUrl(admin,r.email),
            );
            const r1 = await sendWithRetries({
              sender: { name: senderName, email: senderEmail },
              to: [{ email: r.email, name: r.display_name || undefined }],
              replyTo: replyTo ? { email: replyTo } : undefined,
              subject: body.subject,
              htmlContent: html,
              tags: ["broadcast", bc.id],
            });
            if (r1.ok) {
              sent++;
              marketingSentEmails.push(r.email.toLowerCase());
              await admin.from("broadcast_recipients").update({
                status: "sent",
                brevo_message_id: r1.body?.messageId ?? null,
                sent_at: new Date().toISOString(),
                error_message: null,
              }).eq("broadcast_id", bc.id).eq("email", r.email);
            } else {
              failed++;
              const errBody = typeof r1.body === "string" ? r1.body : JSON.stringify(r1.body);
              if(r1.status>=400 && r1.status<500) await admin.from('broadcast_dispatch_claims').delete().eq('broadcast_id',bc.id).eq('email',r.email);
              await admin.from("broadcast_recipients").update({
                status: "failed",
                error_message: `[HTTP ${r1.status} · ${r1.attempts} intento(s)] ${errBody}`.slice(0, 1000),
              }).eq("broadcast_id", bc.id).eq("email", r.email);
            }

          }));
          // Progreso parcial
          await admin.from("broadcasts").update({
            sent_count: sent,
            failed_count: failed,
          }).eq("id", bc.id);
        }

        if (marketingSentEmails.length) {
          await admin
            .from("marketing_contacts")
            .update({ last_campaign_sent_at: new Date().toISOString() })
            .in("email", marketingSentEmails);
        }

        await admin.from("broadcasts").update({
          status: failed === recipients.length ? "failed" : "sent",
          sent_count: sent,
          failed_count: failed,
          sent_at: new Date().toISOString(),
        }).eq("id", bc.id);
      };

      // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(processBroadcast().catch((e) => console.error("processBroadcast error", e)));
      } else {
        processBroadcast().catch((e) => console.error("processBroadcast error", e));
      }

      return new Response(JSON.stringify({
        ok: true,
        broadcast_id: bc.id,
        queued: recipients.length,
        total: recipients.length,
        status: "sending",
      }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "retry_failed") {
      if (!body.broadcast_id) {
        return new Response(JSON.stringify({ error: "Falta broadcast_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: bc, error: bcErr } = await admin
        .from("broadcasts").select("*").eq("id", body.broadcast_id).maybeSingle();
      if (bcErr || !bc) {
        return new Response(JSON.stringify({ error: "Broadcast no encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: failedRows,error:failedError } = await admin
        .from("broadcast_recipients").select("*")
        .eq("broadcast_id", bc.id).eq("status", "failed");
      if(failedError) throw failedError;
      if(failedRows?.some((r:any)=> !/HTTP 4\d\d/.test(r.error_message || ''))) throw new Error('Hay resultados inciertos: conciliá con el proveedor antes de reintentar');
      const rows = (failedRows as any[]) || [];
      if (!rows.length) {
        return new Response(JSON.stringify({ ok: true, retried: 0, message: "No hay destinatarios fallidos" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Each retry must atomically claim its recipient; ambiguous sends retain their claim.
      await admin.from("broadcasts").update({ status: "sending" }).eq("id", bc.id);

      const retryPromoHtml = buildPromoBlock(await loadPromoProducts(admin, (bc as any).promo_product_ids));

      const retryProcess = async () => {
        let sent = 0, failed = 0;
        const BATCH_SIZE = 8;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (r: any) => {
            if(!await claimRecipient(admin,bc.id,r.email)) return;
            const {data:claimedRow,error:ce}=await admin.from('broadcast_recipients').update({status:'pending',error_message:null}).eq('id',r.id).eq('status','failed').select('id').maybeSingle();
            if(ce || !claimedRow) return;
            const recipient = { email: r.email, display_name: r.name, nombre: r.name };
            const html = htmlWrap(
              personalize(bc.content_html, recipient) || "",
              bc.preheader,
              { url: personalize((bc.segment_filters as any)?.cta_url, recipient), label: (bc.segment_filters as any)?.cta_label },
              retryPromoHtml,
              await unsubscribeUrl(admin,r.email),
            );
            const r1 = await sendWithRetries({
              sender: { name: bc.sender_name, email: bc.sender_email },
              to: [{ email: r.email, name: r.name || undefined }],
              replyTo: bc.reply_to ? { email: bc.reply_to } : undefined,
              subject: bc.subject,
              htmlContent: html,
              tags: ["broadcast", bc.id, "retry"],
            });
            if (r1.ok) {
              sent++;
              await admin.from('marketing_contacts').update({last_campaign_sent_at:new Date().toISOString()}).eq('email',r.email);
              await admin.from("broadcast_recipients").update({
                status: "sent",
                brevo_message_id: r1.body?.messageId ?? null,
                sent_at: new Date().toISOString(),
                error_message: null,
              }).eq("id", r.id);
            } else {
              failed++;
              const errBody = typeof r1.body === "string" ? r1.body : JSON.stringify(r1.body);
              if(r1.status>=400 && r1.status<500) await admin.from('broadcast_dispatch_claims').delete().eq('broadcast_id',bc.id).eq('email',r.email);
              await admin.from("broadcast_recipients").update({
                status: "failed",
                error_message: `[reintento · HTTP ${r1.status} · ${r1.attempts} intento(s)] ${errBody}`.slice(0, 1000),
              }).eq("id", r.id);
            }
          }));
        }
        // Recalcular totales del broadcast
        const agg = await allRows(admin.from("broadcast_recipients").select("status").eq("broadcast_id",bc.id).order("id"));
        const s = (agg as any[] || []).filter(x => x.status === "sent").length;
        const f = (agg as any[] || []).filter(x => x.status === "failed").length;
        await admin.from("broadcasts").update({
          status: f === (bc.total_recipients || 0) ? "failed" : "sent",
          sent_count: s,
          failed_count: f,
        }).eq("id", bc.id);
        console.log(`[retry_failed] broadcast ${bc.id} → sent=${sent} failed=${failed}`);
      };

      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(retryProcess().catch((e) => console.error("retry_failed error", e)));
      } else {
        retryProcess().catch((e) => console.error("retry_failed error", e));
      }
      return new Response(JSON.stringify({ ok: true, broadcast_id: bc.id, retried: rows.length, status: "sending" }), {
        status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "modo inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-broadcast error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
