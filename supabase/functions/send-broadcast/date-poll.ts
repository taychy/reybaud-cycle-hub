// Enlaces personales para encuestas de preferencia de fecha (date_polls).
// Se materializan sólo al probar/enviar; los enlaces llevan a una landing que vota por POST.
const PUBLIC_ORIGIN = "https://reybaud-app.com";
const emailKey = (v: unknown) => String(v || "").trim().toLowerCase();
export type DatePollSegment = { date_poll_slug?: string };

async function poll(admin: any, s: DatePollSegment) {
  if (!s.date_poll_slug) return null;
  if (!/^[a-z0-9-]{1,60}$/.test(s.date_poll_slug)) throw new Error("Encuesta de fechas inválida");
  const { data, error } = await admin.from("date_polls").select("id,options,is_open").eq("slug", s.date_poll_slug).maybeSingle();
  if (error || !data || !data.is_open) throw new Error("La encuesta de fechas no existe o está cerrada");
  return data;
}

export async function decorateDatePollRecipients(admin: any, rows: any[], s: DatePollSegment, isTest = false) {
  const p = await poll(admin, s);
  if (!p) return rows;
  const out: any[] = [];
  for (const r of rows) {
    const email = emailKey(r.email);
    if (!email) continue;
    const name = String(r.display_name || r.name || `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim()).trim() || null;
    const { data: inv, error } = await admin.from("date_poll_invites").upsert({
      poll_id: p.id, recipient_email: email, recipient_name: name,
      alumno_id: r.contact_type === "alumno" ? r.id : null, is_test: isTest,
    }, { onConflict: "poll_id,recipient_email,is_test" }).select("token").single();
    if (error || !inv?.token) throw error || new Error("No se pudo preparar el enlace de la encuesta");
    const poll_urls: Record<string, string> = {};
    for (const o of p.options || []) poll_urls[o.value] = `${PUBLIC_ORIGIN}/preferencia-fechas/${inv.token}?opcion=${encodeURIComponent(o.value)}`;
    out.push({ ...r, poll_urls });
  }
  return out;
}

export function personalizeDatePoll(value: string, recipient: any) {
  return value.replace(/\{poll_url_([a-z0-9_]{1,40})\}/g, (_m, k) => recipient?.poll_urls?.[k] || "");
}

export async function markDatePollSent(admin: any, recipient: any, s: DatePollSegment, isTest = false) {
  const p = s.date_poll_slug && !isTest ? await poll(admin, s) : null;
  if (!p) return;
  await admin.from("date_poll_invites").update({ last_sent_at: new Date().toISOString() })
    .eq("poll_id", p.id).eq("recipient_email", emailKey(recipient.email)).eq("is_test", false);
}
