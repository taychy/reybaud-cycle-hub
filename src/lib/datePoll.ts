export type DatePollOption = { value: string; label: string; needs_text?: boolean };

export const SAN_LUIS_2027_POLL_SLUG = "san-luis-2027-fechas";
export const SAN_LUIS_2027_SUBJECT = "🚴 Training Camp San Luis 2027 | ¿Qué fecha te queda mejor?";
export const SAN_LUIS_2027_PREHEADER = "Un clic y listo: ayudanos a elegir la fecha del próximo camp.";

/** El parámetro ?opcion= sólo preselecciona: nunca vota por sí solo. */
export function preselectedOption(options: DatePollOption[], raw: string | null): string | null {
  return raw && options.some((o) => o.value === raw) ? raw : null;
}

export function voteError(option: DatePollOption | undefined, suggestion: string): string | null {
  if (!option) return "Elegí una opción.";
  if (option.needs_text && !suggestion.trim()) return "Contanos qué fecha te quedaría bien.";
  if (suggestion.length > 500) return "La sugerencia puede tener hasta 500 caracteres.";
  return null;
}

const btn = (url: string, label: string, bg: string) =>
  `<tr><td style="padding:6px 0"><a href="${url}" style="display:block;background:${bg};color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 20px;border-radius:10px;text-align:center">${label}</a></td></tr>`;

/** Borrador del correo (layout "plain" de send-broadcast). Placeholders resueltos por destinatario. */
export const SAN_LUIS_2027_EMAIL_HTML = `<div style="font-family:Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.5">
<p>Hola {nombre},</p>
<p>Estamos armando el <strong>Training Camp San Luis 2027</strong> y queremos elegir la fecha con vos. ¿Cuál te queda mejor?</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px">
${btn("{poll_url_enero_17_24}", "17 al 24 de enero", "#e8772e")}
${btn("{poll_url_febrero_18_21}", "18 al 21 de febrero", "#e8772e")}
${btn("{poll_url_otra}", "Otra fecha", "#3a3a3a")}
</table>
<p style="font-size:14px;color:#555">Al tocar un botón se abre una página donde confirmás tu elección. Si elegís «Otra fecha», podés escribir tu sugerencia. Podés cambiar tu respuesta cuando quieras con el mismo botón.</p>
<p>¡Gracias!<br/>Equipo Reybaud</p>
</div>`;
