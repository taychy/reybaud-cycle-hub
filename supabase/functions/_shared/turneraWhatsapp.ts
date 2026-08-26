// WhatsApp channel for Turnera reminders.
//
// Conservative by design: sending only happens when the connector credentials,
// the sender number AND an approved Twilio ContentSid template are all present.
// Otherwise the channel reports `no_configurado` and NOTHING is sent — email is
// never blocked by WhatsApp.

export type WaTipo = "recordatorio" | "coach_recordatorio";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

/** app_config keys holding the approved Twilio ContentSid per reminder type. */
export const CONTENT_SID_KEYS: Record<WaTipo, string> = {
  recordatorio: "turnera_wa_content_sid_alumno_recordatorio",
  coach_recordatorio: "turnera_wa_content_sid_coach_recordatorio",
};

export type WaConfig = {
  configured: boolean;
  missing: string[];
  lovableApiKey?: string;
  twilioApiKey?: string;
  from?: string;
  contentSid?: string;
};

/** Normaliza teléfono AR a formato WhatsApp (549 + área + número). */
export const normalizePhoneWA = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  while (d.startsWith("0")) d = d.slice(1);
  if (d.length > 10) {
    for (const areaLen of [2, 3, 4]) {
      if (d.length - areaLen >= 8 && d.substring(areaLen, areaLen + 2) === "15") {
        const c = d.substring(0, areaLen) + d.substring(areaLen + 2);
        if (c.length === 10) { d = c; break; }
      }
    }
  }
  if (d.length < 10 || d.length > 11) return null;
  return "549" + d.slice(-10);
};

/** Resuelve credenciales + plantilla aprobada. Sin ContentSid → no configurado. */
export async function getWhatsappConfig(supabase: any, tipo: WaTipo): Promise<WaConfig> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const twilioApiKey = Deno.env.get("TWILIO_API_KEY") || "";
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "";

  let contentSid = "";
  try {
    const { data } = await supabase
      .from("app_config").select("value").eq("key", CONTENT_SID_KEYS[tipo]).maybeSingle();
    const raw = (data?.value as unknown) ?? "";
    contentSid = (typeof raw === "string" ? raw : String(raw || "")).trim();
  } catch { /* config ausente → no configurado */ }

  const missing: string[] = [];
  if (!lovableApiKey) missing.push("LOVABLE_API_KEY");
  if (!twilioApiKey) missing.push("TWILIO_API_KEY (conector Twilio no vinculado)");
  if (!from) missing.push("TWILIO_WHATSAPP_FROM");
  if (!contentSid) missing.push(`app_config.${CONTENT_SID_KEYS[tipo]} (ContentSid aprobado)`);

  return { configured: missing.length === 0, missing, lovableApiKey, twilioApiKey, from, contentSid };
}

export type WaResult =
  | { ok: true; estado: "queued" | "sent"; sid: string | null; providerStatus: string }
  | { ok: false; code: string; message: string };

/**
 * Envía una plantilla aprobada por el gateway de Twilio.
 * NUNCA texto libre: la automatización programada sale fuera de la ventana 24h.
 * `queued` = aceptado por el proveedor; `sent` sólo si el proveedor ya lo confirma.
 */
export async function sendWhatsappTemplate(
  cfg: WaConfig,
  to: string,
  variables: Record<string, string>,
): Promise<WaResult> {
  if (!cfg.configured) return { ok: false, code: "no_configurado", message: cfg.missing.join(", ") };
  try {
    const resp = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.lovableApiKey}`,
        "X-Connection-Api-Key": cfg.twilioApiKey!,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:+${to}`,
        From: cfg.from!.startsWith("whatsapp:") ? cfg.from! : `whatsapp:${cfg.from}`,
        ContentSid: cfg.contentSid!,
        ContentVariables: JSON.stringify(variables),
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      let code = String(resp.status);
      try { code = String(JSON.parse(text)?.code ?? resp.status); } catch { /* texto plano */ }
      console.error(`[turnera-wa] provider error [${resp.status}]: ${text}`);
      return { ok: false, code, message: text.slice(0, 500) };
    }

    const json = JSON.parse(text);
    const providerStatus = String(json?.status || "queued");
    // El proveedor sólo confirma entrega vía status callback; no inventamos "sent".
    const estado = ["sent", "delivered", "read"].includes(providerStatus) ? "sent" : "queued";
    return { ok: true, estado, sid: json?.sid ?? null, providerStatus };
  } catch (e) {
    return { ok: false, code: "network_error", message: (e as Error).message.slice(0, 500) };
  }
}
