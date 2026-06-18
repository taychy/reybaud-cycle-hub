// Plantilla de email — Roadbook Tour de Francia 26'
// Diseño alineado a la app (dark + naranja primario + cian acento, Inter/Oswald)
// Reemplazá los `#` por los enlaces reales (GPX, hoteles) antes de enviar.

export const tourDeFrancia26Subject = "Tour de Francia 26' · Roadbook completo";

const O = "#f97316"; // primary (orange)
const C = "#06b6d4"; // accent (cyan)
const BG = "#0a0a0a";
const CARD = "#141414";
const BORDER = "#262626";
const TEXT = "#e5e5e5";
const MUTED = "#a3a3a3";

const itinerario: Array<[string, string, string, string, string, string]> = [
  ["1", "Briefing, ajuste de bici & warm up ride", "26/06/26", "51,3", "667 m", "Hotel Carlemany"],
  ["2", "Girona loop", "27/06/26", "69,5", "1.055 m", "Hotel Carlemany"],
  ["3", "Girona → Camprodon", "28/06/26", "93,7", "1.867 m", "Hotel Edelweiss"],
  ["4", "Camprodon → Céret", "29/06/26", "63,3", "778 m", "Côte Le Thalasso"],
  ["5", "Banyuls Sur Mer loop", "30/06/26", "66,6", "1.137 m", "Côte Le Thalasso"],
  ["6", "Banyuls Sur Mer → Girona", "01/07/26", "90,4", "993 m", "Hotel Carlemany"],
  ["7", "Girona loop", "02/07/26", "92,2", "1.282 m", "Hotel Carlemany"],
  ["8", "Girona → Montseny", "03/07/26", "86,3", "1.976 m", "Hotel Montanya"],
  ["9", "Montseny → Barcelona & Etapa TDF (TT)", "04/07/26", "107", "1.261 m", "Occidental Atenea Mar"],
  ["10", "Barcelona loop & Etapa TDF", "05/07/26", "109,9", "1.293 m", "Occidental Atenea Mar"],
  ["11", "Día de salida", "06/07/26", "—", "—", "—"],
];

const rutas: Array<{ dia: string; km: string; d: string; hotel: string; gpxUrl: string }> = [
  { dia: "Día 1", km: "51,3 KM", d: "667 m", hotel: "Hotel Carlemany", gpxUrl: "#" },
  { dia: "Día 2", km: "69,5 KM", d: "1.055 m", hotel: "Hotel Carlemany", gpxUrl: "#" },
  { dia: "Día 3", km: "93,7 KM", d: "1.867 m", hotel: "Hotel Edelweiss", gpxUrl: "#" },
  { dia: "Día 4", km: "63,3 KM", d: "778 m", hotel: "Côte Thalasso", gpxUrl: "#" },
  { dia: "Día 5", km: "66,6 KM", d: "1.137 m", hotel: "Côte Thalasso", gpxUrl: "#" },
  { dia: "Día 6", km: "90,4 KM", d: "993 m", hotel: "Hotel Carlemany", gpxUrl: "#" },
  { dia: "Día 7", km: "92,2 KM", d: "1.282 m", hotel: "Hotel Carlemany", gpxUrl: "#" },
  { dia: "Día 8", km: "86,3 KM", d: "1.976 m", hotel: "Hotel Montanya", gpxUrl: "#" },
  { dia: "Día 9", km: "107 KM", d: "1.261 m", hotel: "Occidental Atenea Mar", gpxUrl: "#" },
  { dia: "Día 10", km: "109,9 KM", d: "1.293 m", hotel: "Occidental Atenea Mar", gpxUrl: "#" },
];

const alojamientos: Array<{ pais: string; nombre: string; url: string }> = [
  { pais: "Francia",   nombre: "Hotel Côte Thalasso",       url: "#" },
  { pais: "Barcelona", nombre: "Hotel Occidental Atenea Mar", url: "#" },
  { pais: "Girona",    nombre: "Hotel Carlemany",            url: "#" },
  { pais: "Montseny",  nombre: "Hotel Montanya",             url: "#" },
  { pais: "Camprodon", nombre: "Hotel Camprodon",            url: "#" },
];

const sectionTitle = (label: string) => `
  <div style="margin:28px 0 12px;display:flex;align-items:center;gap:10px;">
    <div style="width:24px;height:2px;background:${O};"></div>
    <h2 style="margin:0;font-family:Oswald,Inter,Arial,sans-serif;font-size:13px;letter-spacing:.22em;color:${O};text-transform:uppercase;font-weight:600;">${label}</h2>
  </div>`;

const itinerarioRows = itinerario.map(([n, dia, fecha, km, d, hotel], i) => `
  <tr style="background:${i % 2 === 0 ? "#101010" : "#161616"};">
    <td style="padding:10px 8px;color:${O};font-weight:600;width:28px;text-align:center;font-family:Oswald,Inter,Arial,sans-serif;">${n}</td>
    <td style="padding:10px 8px;color:${TEXT};">${dia}</td>
    <td style="padding:10px 8px;color:${MUTED};white-space:nowrap;">${fecha}</td>
    <td style="padding:10px 8px;color:${C};text-align:right;white-space:nowrap;">${km}</td>
    <td style="padding:10px 8px;color:${MUTED};text-align:right;white-space:nowrap;">${d}</td>
    <td style="padding:10px 8px;color:${TEXT};">${hotel}</td>
  </tr>`).join("");

const rutasCards = rutas.map((r) => `
  <tr><td style="padding:6px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#101010;border:1px solid ${BORDER};border-radius:10px;">
      <tr>
        <td style="padding:12px 14px;">
          <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:12px;letter-spacing:.18em;color:${C};text-transform:uppercase;">${r.dia}</div>
          <div style="margin-top:4px;color:${TEXT};font-size:15px;font-weight:600;">${r.hotel}</div>
          <div style="margin-top:2px;color:${MUTED};font-size:13px;">${r.km} · D+ ${r.d}</div>
        </td>
        <td align="right" style="padding:12px 14px;white-space:nowrap;">
          <a href="${r.gpxUrl}" style="display:inline-block;background:${O};color:#fff;text-decoration:none;font-family:Oswald,Inter,Arial,sans-serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:9px 14px;border-radius:8px;font-weight:600;">GPX</a>
        </td>
      </tr>
    </table>
  </td></tr>`).join("");

const alojamientosRows = alojamientos.map((a) => `
  <tr><td style="padding:6px 0;">
    <a href="${a.url}" style="display:block;text-decoration:none;background:#101010;border:1px solid ${BORDER};border-left:3px solid ${C};border-radius:10px;padding:12px 14px;">
      <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:11px;letter-spacing:.22em;color:${C};text-transform:uppercase;">${a.pais}</div>
      <div style="margin-top:4px;color:${TEXT};font-size:15px;font-weight:600;">${a.nombre} →</div>
    </a>
  </td></tr>`).join("");

export const tourDeFrancia26BodyHtml = `
<div style="font-family:Inter,Arial,sans-serif;color:${TEXT};">

  <p style="margin:0 0 14px;color:${MUTED};font-size:14px;">
    Compartimos toda la información del viaje: itinerario, rutas con GPX, alojamientos y recomendaciones.
    Cualquier consulta nos escribís y te ayudamos.
  </p>

  <div style="margin:18px 0;padding:14px 16px;background:#101010;border:1px solid ${BORDER};border-left:3px solid ${O};border-radius:10px;">
    <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:11px;letter-spacing:.22em;color:${O};text-transform:uppercase;">Fechas</div>
    <div style="margin-top:4px;color:${TEXT};font-size:16px;font-weight:600;">26 de junio — 6 de julio de 2026</div>
    <div style="margin-top:2px;color:${MUTED};font-size:13px;">Girona · Camprodon · Banyuls Sur Mer · Montseny · Barcelona</div>
  </div>

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
    <tbody>${itinerarioRows}</tbody>
  </table>

  ${sectionTitle("Bienvenida · 26/06")}
  <p style="margin:0 0 10px;color:${TEXT};font-size:15px;line-height:1.6;">
    Nos encontramos a las <strong style="color:${O};">9:30 h en el Hotel Carlemany</strong>.
    Dejamos el equipaje en el hotel y vamos caminando juntos a retirar las bicicletas de alquiler.
  </p>
  <p style="margin:0 0 10px;color:${MUTED};font-size:14px;line-height:1.6;">
    Para que sea más cómodo, vení ya con la indumentaria ciclista y llevá las zapatillas de ciclismo en un bolso de mano para cambiarlas en el rental.
    Al terminar la salida volvemos al hotel para el check-in.
  </p>

  ${sectionTitle("Rutas y GPX")}
  <table width="100%" cellpadding="0" cellspacing="0">${rutasCards}</table>

  ${sectionTitle("Alojamientos")}
  <table width="100%" cellpadding="0" cellspacing="0">${alojamientosRows}</table>

  ${sectionTitle("Clima")}
  <p style="margin:0 0 8px;color:${TEXT};font-size:14px;line-height:1.6;">
    Días cálidos y soleados, mañanas agradables para pedalear y temperaturas más altas al mediodía. Posibilidad de tormentas puntuales al final de la tarde.
  </p>
  <p style="margin:0 0 8px;color:${MUTED};font-size:13px;line-height:1.6;">
    <strong style="color:${C};">27–33 °C</strong> de día · <strong style="color:${C};">17–22 °C</strong> de noche.
    Recomendamos ropa ligera y transpirable, protección solar, gafas, hidratación abundante y un chaleco fino para descensos de montaña.
  </p>

  ${sectionTitle("Día de salida · 06/07")}
  <p style="margin:0 0 8px;color:${TEXT};font-size:14px;line-height:1.6;">
    Check-out a las <strong style="color:${O};">12:00 h</strong>. Las bicis de alquiler regresan a Girona la noche anterior, así que al finalizar la rodada del 5 de julio acordate de retirar GPS, luces, soportes, sensores y todo accesorio personal.
  </p>
  <p style="margin:0 0 8px;color:${MUTED};font-size:13px;line-height:1.6;">
    Si necesitás traslado al aeropuerto o a otro destino, el equipo lo organiza el día anterior a la salida.
  </p>

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid ${BORDER};text-align:center;">
    <div style="font-family:Oswald,Inter,Arial,sans-serif;font-size:12px;letter-spacing:.22em;color:${MUTED};text-transform:uppercase;">Tour de Francia 26'</div>
    <div style="margin-top:4px;color:${TEXT};font-size:14px;">Girona → Barcelona</div>
  </div>

</div>
`;

export const EMAIL_TEMPLATES = [
  {
    id: "tdf26",
    label: "Roadbook Tour de Francia 26'",
    subject: tourDeFrancia26Subject,
    bodyHtml: tourDeFrancia26BodyHtml,
  },
] as const;
