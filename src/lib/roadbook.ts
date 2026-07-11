// Roadbook estructurado por evento (camps/viajes)
// Estructura editable, render a HTML para email (colores de la app),
// y vista para alumno dentro del evento.

export interface RoadbookDay {
  numero: string;          // "1", "2", ... o "11"
  titulo: string;          // "Girona loop", "Día de salida"
  fecha: string;           // "26/06/26"
  km: string;              // "51,3" o "—"
  desnivel: string;        // "667 m" o "—"
  hotel: string;           // "Hotel Carlemany"
  gpx_url?: string;        // link al GPX (opcional)
}

export interface RoadbookHotel {
  pais: string;            // "Francia", "Girona", etc.
  nombre: string;          // "Hotel Carlemany"
  url?: string;            // link reserva / web
}

export interface RoadbookSection {
  enabled: boolean;
  titulo: string;
  contenido: string;       // texto plano, los \n se respetan
}

export interface Roadbook {
  version: 1;
  intro: string;                       // Bajada general
  fechas_label: string;                // "26 de junio — 6 de julio de 2026"
  recorrido_label: string;             // "Girona · Camprodon · ..."
  dias: RoadbookDay[];
  alojamientos: RoadbookHotel[];
  bienvenida: RoadbookSection;
  clima: RoadbookSection;
  salida: RoadbookSection;
}

// ─────────────────────────────────────────────────────────────
// Plantilla por defecto: Tour de Francia 26'
// ─────────────────────────────────────────────────────────────
export const DEFAULT_ROADBOOK_TDF26: Roadbook = {
  version: 1,
  intro:
    "Compartimos toda la información del viaje: itinerario, rutas con GPX, alojamientos y recomendaciones. Cualquier consulta nos escribís y te ayudamos.",
  fechas_label: "26 de junio — 6 de julio de 2026",
  recorrido_label: "Girona · Camprodon · Banyuls Sur Mer · Montseny · Barcelona",
  dias: [
    { numero: "1",  titulo: "Briefing, ajuste de bici & warm up ride", fecha: "26/06/26", km: "51,3",  desnivel: "667 m",   hotel: "Hotel Carlemany",         gpx_url: "" },
    { numero: "2",  titulo: "Girona loop",                              fecha: "27/06/26", km: "69,5",  desnivel: "1.055 m", hotel: "Hotel Carlemany",         gpx_url: "" },
    { numero: "3",  titulo: "Girona → Camprodon",                       fecha: "28/06/26", km: "93,7",  desnivel: "1.867 m", hotel: "Hotel Edelweiss",         gpx_url: "" },
    { numero: "4",  titulo: "Camprodon → Céret",                        fecha: "29/06/26", km: "63,3",  desnivel: "778 m",   hotel: "Côte Le Thalasso",        gpx_url: "" },
    { numero: "5",  titulo: "Banyuls Sur Mer loop",                     fecha: "30/06/26", km: "66,6",  desnivel: "1.137 m", hotel: "Côte Le Thalasso",        gpx_url: "" },
    { numero: "6",  titulo: "Banyuls Sur Mer → Girona",                 fecha: "01/07/26", km: "90,4",  desnivel: "993 m",   hotel: "Hotel Carlemany",         gpx_url: "" },
    { numero: "7",  titulo: "Girona loop",                              fecha: "02/07/26", km: "92,2",  desnivel: "1.282 m", hotel: "Hotel Carlemany",         gpx_url: "" },
    { numero: "8",  titulo: "Girona → Montseny",                        fecha: "03/07/26", km: "86,3",  desnivel: "1.976 m", hotel: "Hotel Montanya",          gpx_url: "" },
    { numero: "9",  titulo: "Montseny → Barcelona & Etapa TDF (TT)",    fecha: "04/07/26", km: "107",   desnivel: "1.261 m", hotel: "Occidental Atenea Mar",   gpx_url: "" },
    { numero: "10", titulo: "Barcelona loop & Etapa TDF",               fecha: "05/07/26", km: "109,9", desnivel: "1.293 m", hotel: "Occidental Atenea Mar",   gpx_url: "" },
    { numero: "11", titulo: "Día de salida",                            fecha: "06/07/26", km: "—",     desnivel: "—",       hotel: "—",                       gpx_url: "" },
  ],
  alojamientos: [
    { pais: "Francia",   nombre: "Hotel Côte Thalasso",        url: "" },
    { pais: "Barcelona", nombre: "Hotel Occidental Atenea Mar", url: "" },
    { pais: "Girona",    nombre: "Hotel Carlemany",             url: "" },
    { pais: "Montseny",  nombre: "Hotel Montanya",              url: "" },
    { pais: "Camprodon", nombre: "Hotel Camprodon",             url: "" },
  ],
  bienvenida: {
    enabled: true,
    titulo: "Bienvenida · 26/06",
    contenido:
      "Nos encontramos a las 9:30 h en el Hotel Carlemany. Dejamos el equipaje en el hotel y vamos caminando juntos a retirar las bicicletas de alquiler.\n\nPara que sea más cómodo, vení ya con la indumentaria ciclista y llevá las zapatillas de ciclismo en un bolso de mano para cambiarlas en el rental. Al terminar la salida volvemos al hotel para el check-in.",
  },
  clima: {
    enabled: true,
    titulo: "Clima",
    contenido:
      "Días cálidos y soleados, mañanas agradables para pedalear y temperaturas más altas al mediodía. Posibilidad de tormentas puntuales al final de la tarde.\n\n27–33 °C de día · 17–22 °C de noche. Recomendamos ropa ligera y transpirable, protección solar, gafas, hidratación abundante y un chaleco fino para descensos de montaña.",
  },
  salida: {
    enabled: true,
    titulo: "Día de salida · 06/07",
    contenido:
      "Check-out a las 12:00 h. Las bicis de alquiler regresan a Girona la noche anterior, así que al finalizar la rodada del 5 de julio acordate de retirar GPS, luces, soportes, sensores y todo accesorio personal.\n\nSi necesitás traslado al aeropuerto o a otro destino, el equipo lo organiza el día anterior a la salida.",
  },
};

// Devuelve versión "teaser" para prospectos (sin hoteles ni GPX).
export const toTeaserRoadbook = (rb: Roadbook): Roadbook => ({
  ...rb,
  dias: rb.dias.map((d) => ({ ...d, hotel: "", gpx_url: "" })),
  alojamientos: [],
});

// Plantilla genérica vacía (para eventos nuevos cuyo destino no es TDF26).
export const createEmptyRoadbook = (): Roadbook => ({
  version: 1,
  intro: "Compartimos toda la información del viaje: itinerario, rutas con GPX, alojamientos y recomendaciones.",
  fechas_label: "",
  recorrido_label: "",
  dias: [
    { numero: "1", titulo: "", fecha: "", km: "", desnivel: "", hotel: "", gpx_url: "" },
  ],
  alojamientos: [{ pais: "", nombre: "", url: "" }],
  bienvenida: { enabled: true,  titulo: "Bienvenida", contenido: "" },
  clima:      { enabled: true,  titulo: "Clima",      contenido: "" },
  salida:     { enabled: true,  titulo: "Día de salida", contenido: "" },
});

// Sanitiza un Roadbook potencialmente parcial (JSON viejo / null) a un objeto completo.
export const normalizeRoadbook = (raw: any): Roadbook => {
  if (!raw || typeof raw !== "object") return createEmptyRoadbook();
  const base = createEmptyRoadbook();
  return {
    version: 1,
    intro: typeof raw.intro === "string" ? raw.intro : base.intro,
    fechas_label: raw.fechas_label || "",
    recorrido_label: raw.recorrido_label || "",
    dias: Array.isArray(raw.dias) && raw.dias.length
      ? raw.dias.map((d: any) => ({
          numero: String(d?.numero ?? ""),
          titulo: String(d?.titulo ?? ""),
          fecha: String(d?.fecha ?? ""),
          km: String(d?.km ?? ""),
          desnivel: String(d?.desnivel ?? ""),
          hotel: String(d?.hotel ?? ""),
          gpx_url: String(d?.gpx_url ?? ""),
        }))
      : base.dias,
    alojamientos: Array.isArray(raw.alojamientos) && raw.alojamientos.length
      ? raw.alojamientos.map((h: any) => ({
          pais: String(h?.pais ?? ""),
          nombre: String(h?.nombre ?? ""),
          url: String(h?.url ?? ""),
        }))
      : base.alojamientos,
    bienvenida: { enabled: raw.bienvenida?.enabled ?? true, titulo: raw.bienvenida?.titulo || "Bienvenida", contenido: raw.bienvenida?.contenido || "" },
    clima:      { enabled: raw.clima?.enabled ?? true,      titulo: raw.clima?.titulo || "Clima",           contenido: raw.clima?.contenido || "" },
    salida:     { enabled: raw.salida?.enabled ?? true,     titulo: raw.salida?.titulo || "Día de salida",   contenido: raw.salida?.contenido || "" },
  };
};

// ─────────────────────────────────────────────────────────────
// HTML builder (email) — colores de la app
// ─────────────────────────────────────────────────────────────
const O = "#f97316";   // primary orange
const C = "#06b6d4";   // accent cyan
const BORDER = "#262626";
const TEXT = "#e5e5e5";
const MUTED = "#a3a3a3";

const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paragraphs = (s: string) =>
  String(s ?? "")
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 10px;color:${TEXT};font-size:14px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");

const sectionTitle = (label: string) => `
  <div style="margin:28px 0 12px;">
    <div style="display:inline-block;width:24px;height:2px;background:${O};vertical-align:middle;"></div>
    <span style="margin-left:10px;font-family:Oswald,Inter,Arial,sans-serif;font-size:13px;letter-spacing:.22em;color:${O};text-transform:uppercase;font-weight:600;">${escapeHtml(label)}</span>
  </div>`;

export const buildRoadbookHtml = (rb: Roadbook, eventTitle: string): string => {
  const itinRows = rb.dias
    .map(
      (d, i) => `
    <tr style="background:${i % 2 === 0 ? "#101010" : "#161616"};">
      <td style="padding:10px 8px;color:${O};font-weight:600;width:28px;text-align:center;font-family:Oswald,Inter,Arial,sans-serif;">${escapeHtml(d.numero)}</td>
      <td style="padding:10px 8px;color:${TEXT};">${escapeHtml(d.titulo)}</td>
      <td style="padding:10px 8px;color:${MUTED};white-space:nowrap;">${escapeHtml(d.fecha)}</td>
      <td style="padding:10px 8px;color:${C};text-align:right;white-space:nowrap;">${escapeHtml(d.km)}</td>
      <td style="padding:10px 8px;color:${MUTED};text-align:right;white-space:nowrap;">${escapeHtml(d.desnivel)}</td>
      <td style="padding:10px 8px;color:${TEXT};">${escapeHtml(d.hotel)}</td>
    </tr>`,
    )
    .join("");

  const rutaCards = rb.dias
    .filter((d) => d.gpx_url && d.gpx_url.trim())
    .map(
      (d) => `
    <tr><td style="padding:6px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#101010;border:1px solid ${BORDER};border-radius:10px;">
        <tr>
          <td style="padding:12px 14px;">
            <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:12px;letter-spacing:.18em;color:${C};text-transform:uppercase;">Día ${escapeHtml(d.numero)} · ${escapeHtml(d.fecha)}</div>
            <div style="margin-top:4px;color:${TEXT};font-size:15px;font-weight:600;">${escapeHtml(d.titulo)}</div>
            <div style="margin-top:2px;color:${MUTED};font-size:13px;">${escapeHtml(d.km)} KM · D+ ${escapeHtml(d.desnivel)}</div>
          </td>
          <td align="right" style="padding:12px 14px;white-space:nowrap;">
            <a href="${escapeHtml(d.gpx_url!)}" style="display:inline-block;background:${O};color:#fff;text-decoration:none;font-family:Oswald,Inter,Arial,sans-serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:9px 14px;border-radius:8px;font-weight:600;">GPX</a>
          </td>
        </tr>
      </table>
    </td></tr>`,
    )
    .join("");

  const hotelRows = rb.alojamientos
    .filter((h) => h.nombre)
    .map((h) => {
      const inner = `
        <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:11px;letter-spacing:.22em;color:${C};text-transform:uppercase;">${escapeHtml(h.pais)}</div>
        <div style="margin-top:4px;color:${TEXT};font-size:15px;font-weight:600;">${escapeHtml(h.nombre)}${h.url ? " →" : ""}</div>`;
      const wrapStyle = `display:block;text-decoration:none;background:#101010;border:1px solid ${BORDER};border-left:3px solid ${C};border-radius:10px;padding:12px 14px;`;
      return `<tr><td style="padding:6px 0;">${
        h.url ? `<a href="${escapeHtml(h.url)}" style="${wrapStyle}">${inner}</a>` : `<div style="${wrapStyle}">${inner}</div>`
      }</td></tr>`;
    })
    .join("");

  return `
<div style="font-family:Inter,Arial,sans-serif;color:${TEXT};">

  ${rb.intro ? `<p style="margin:0 0 14px;color:${MUTED};font-size:14px;line-height:1.55;">${escapeHtml(rb.intro)}</p>` : ""}

  ${rb.fechas_label || rb.recorrido_label ? `
  <div style="margin:18px 0;padding:14px 16px;background:#101010;border:1px solid ${BORDER};border-left:3px solid ${O};border-radius:10px;">
    <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:11px;letter-spacing:.22em;color:${O};text-transform:uppercase;">Fechas</div>
    <div style="margin-top:4px;color:${TEXT};font-size:16px;font-weight:600;">${escapeHtml(rb.fechas_label)}</div>
    ${rb.recorrido_label ? `<div style="margin-top:2px;color:${MUTED};font-size:13px;">${escapeHtml(rb.recorrido_label)}</div>` : ""}
  </div>` : ""}

  ${sectionTitle("Itinerario")}
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;font-size:13px;">
    <thead>
      <tr style="background:#1c1c1c;">
        <th style="padding:10px 8px;text-align:center;color:${MUTED};font-weight:500;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">#</th>
        <th style="padding:10px 8px;text-align:left;color:${MUTED};font-weight:500;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">Día</th>
        <th style="padding:10px 8px;text-align:left;color:${MUTED};font-weight:500;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">Fecha</th>
        <th style="padding:10px 8px;text-align:right;color:${MUTED};font-weight:500;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">Km</th>
        <th style="padding:10px 8px;text-align:right;color:${MUTED};font-weight:500;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">D+</th>
        <th style="padding:10px 8px;text-align:left;color:${MUTED};font-weight:500;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">Alojamiento</th>
      </tr>
    </thead>
    <tbody>${itinRows}</tbody>
  </table>

  ${rb.bienvenida.enabled && rb.bienvenida.contenido ? `${sectionTitle(rb.bienvenida.titulo)}${paragraphs(rb.bienvenida.contenido)}` : ""}

  ${rutaCards ? `${sectionTitle("Rutas y GPX")}<table width="100%" cellpadding="0" cellspacing="0">${rutaCards}</table>` : ""}

  ${hotelRows ? `${sectionTitle("Alojamientos")}<table width="100%" cellpadding="0" cellspacing="0">${hotelRows}</table>` : ""}

  ${rb.clima.enabled && rb.clima.contenido ? `${sectionTitle(rb.clima.titulo)}${paragraphs(rb.clima.contenido)}` : ""}

  ${rb.salida.enabled && rb.salida.contenido ? `${sectionTitle(rb.salida.titulo)}${paragraphs(rb.salida.contenido)}` : ""}

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid ${BORDER};text-align:center;">
    <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:12px;letter-spacing:.22em;color:${MUTED};text-transform:uppercase;">${escapeHtml(eventTitle)}</div>
    ${rb.recorrido_label ? `<div style="margin-top:4px;color:${TEXT};font-size:14px;">${escapeHtml(rb.recorrido_label)}</div>` : ""}
  </div>

</div>`;
};
