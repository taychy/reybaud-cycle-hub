// Edge function: choice-survey
// Enlace universal para encuestas operativas de una pregunta (events.metadata.choice_surveys[]).
// Acciones:
//   config  -> configuración pública de la encuesta (sin datos personales)
//   resolve -> reservas ACTIVAS propias del evento según identidad verificada
//   save    -> guarda/edita la respuesta de una reserva propia
// Identidad: token personal de reserva (?token=) o JWT verificado (alumno por
// current_alumno_id, o externo cuyo email coincide exactamente con el email del JWT).
// Nunca busca por email enviado por el cliente. verify_jwt=false: se valida en código.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_RE = /^[a-f0-9]{32,128}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const KEY_RE = /^[a-z0-9_]{1,40}$/;
const INACTIVE = ["cancelada", "rechazada"];

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const URL_ = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (!["config", "resolve", "save"].includes(action)) return json({ error: "invalid_action" }, 400);

    // --- Localizar evento + encuesta (por alias o por id+key) ---
    const slug = typeof body.slug === "string" ? body.slug : null;
    let ev: any = null;
    if (slug) {
      if (!SLUG_RE.test(slug)) return json({ error: "not_found" }, 404);
      const { data } = await admin.from("events").select("id, title, metadata")
        .contains("metadata", { choice_surveys: [{ slug }] }).limit(2);
      if (!data || data.length !== 1) return json({ error: "not_found" }, 404);
      ev = data[0];
    } else {
      if (!UUID_RE.test(String(body.event_id ?? "")) || !KEY_RE.test(String(body.survey_key ?? ""))) return json({ error: "not_found" }, 404);
      const { data } = await admin.from("events").select("id, title, metadata").eq("id", body.event_id).maybeSingle();
      ev = data;
    }
    const surveys: any[] = Array.isArray(ev?.metadata?.choice_surveys) ? ev.metadata.choice_surveys : [];
    const survey = surveys.find((s) => s?.enabled === true && (slug ? s.slug === slug : s.key === body.survey_key));
    if (!ev || !survey || !KEY_RE.test(String(survey.key))) return json({ error: "not_found" }, 404);
    const stepKey = `encuesta_${survey.key}`;
    const publicSurvey = {
      key: survey.key, title: survey.title, subtitle: survey.subtitle ?? null, intro: survey.intro ?? null,
      question: survey.question,
      options: (survey.options ?? []).map((o: any) => ({ value: String(o.value), label: String(o.label), needs_follow_up: !!o.needs_follow_up })),
    };
    if (action === "config") return json({ ok: true, event: { id: ev.id, title: ev.title }, survey: publicSurvey });

    // --- Identidad ---
    let reservations: any[] = [];
    const resCols = "id, event_id, reservation_status, alumno_id, external_participant_id, package_nombre_snapshot";
    const token = typeof body.token === "string" && body.token ? body.token.trim() : null;
    if (token) {
      if (!TOKEN_RE.test(token)) return json({ error: "invalid_token" }, 400);
      const { data } = await admin.from("event_reservations").select(resCols).eq("access_token", token).maybeSingle();
      if (!data || data.event_id !== ev.id) return json({ error: "not_found" }, 404);
      reservations = [data];
    } else {
      const auth = req.headers.get("Authorization") ?? "";
      if (!auth.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
      const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: cl, error: clErr } = await userClient.auth.getClaims(auth.slice(7));
      const email = norm(cl?.claims?.email);
      if (clErr || !cl?.claims?.sub || cl.claims.role !== "authenticated" || !email) return json({ error: "auth_required" }, 401);
      const { data: alumnoId } = await userClient.rpc("current_alumno_id");

      const { data: all } = await admin.from("event_reservations").select(resCols).eq("event_id", ev.id);
      const rows = all ?? [];
      const extIds = [...new Set(rows.map((r) => r.external_participant_id).filter(Boolean))];
      const matchExt = new Set<string>();
      if (extIds.length) {
        const { data: exts } = await admin.from("event_external_participants").select("id, email").in("id", extIds);
        for (const x of exts ?? []) if (norm(x.email) && norm(x.email) === email) matchExt.add(x.id);
      }
      reservations = rows.filter((r) => (alumnoId && r.alumno_id === alumnoId) || (r.external_participant_id && matchExt.has(r.external_participant_id)));
    }
    const active = reservations.filter((r) => !INACTIVE.includes(String(r.reservation_status)));

    if (action === "save") {
      const rid = String(body.reservation_id ?? "");
      const target = active.find((r) => r.id === rid);
      if (!target) return json({ error: "reserva_no_disponible" }, 403);
      const ans = String(body.respuesta ?? "");
      if (!publicSurvey.options.some((o: any) => o.value === ans)) return json({ error: "respuesta_invalido" }, 400);
      const { data, error } = await admin.from("reservation_checklist_data").upsert(
        { reservation_id: target.id, alumno_id: target.alumno_id, step_key: stepKey, completed: true, needs_advice: false, data: { respuesta: ans }, file_url: null },
        { onConflict: "reservation_id,step_key" },
      ).select("data").single();
      if (error) return json({ error: "save_failed" }, 400);
      return json({ ok: true, answer: data.data });
    }

    // resolve: solo datos de las reservas propias (nombre del participante para elegir).
    if (!active.length) return json({ ok: true, reservations: [], had_inactive: reservations.length > 0 });
    const ids = active.map((r) => r.id);
    const aluIds = [...new Set(active.map((r) => r.alumno_id).filter(Boolean))];
    const extIds = [...new Set(active.map((r) => r.external_participant_id).filter(Boolean))];
    const [ans, alus, exts] = await Promise.all([
      admin.from("reservation_checklist_data").select("reservation_id, data").eq("step_key", stepKey).in("reservation_id", ids),
      aluIds.length ? admin.from("alumnos").select("id, nombre, apellido").in("id", aluIds) : Promise.resolve({ data: [] as any[] }),
      extIds.length ? admin.from("event_external_participants").select("id, nombre, apellido").in("id", extIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const name = (p: any) => p ? [p.nombre, p.apellido].filter(Boolean).join(" ") : null;
    return json({
      ok: true,
      reservations: active.map((r) => ({
        reservation_id: r.id,
        participante: name((exts.data ?? []).find((x: any) => x.id === r.external_participant_id))
          ?? name((alus.data ?? []).find((x: any) => x.id === r.alumno_id)) ?? "Tu reserva",
        paquete: r.package_nombre_snapshot ?? null,
        answer: (ans.data ?? []).find((a: any) => a.reservation_id === r.id)?.data ?? null,
      })),
    });
  } catch (_e) {
    return json({ error: "internal_error" }, 500);
  }
});
