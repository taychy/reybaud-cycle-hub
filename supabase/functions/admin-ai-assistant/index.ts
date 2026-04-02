import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Eres el asistente de soporte de la app de Ciclismo Reybaud. Tu rol es ayudar a los administradores a entender y usar la plataforma.

La app tiene las siguientes secciones y funcionalidades:

## Panel Admin
- **Dashboard**: Vista general con métricas de alumnos, pagos, suscripciones activas.
- **Alumnos**: Gestión completa de alumnos (crear, editar, cambiar estado, asignar planes, ver actividad). Los alumnos pueden tener estados: activo, inactivo, suspendido, baja.
- **Planes**: Crear y editar planes de suscripción con precio, frecuencia, moneda. Se pueden asignar a alumnos desde su ficha.
- **Suscripciones**: Cada alumno puede tener una suscripción activa vinculada a un plan. Se puede cambiar, pausar, cancelar o reactivar.
- **Pagos**: Registro de pagos de alumnos. Se pueden registrar pagos en efectivo, tarjeta o medios externos.
- **Descuentos**: Sistema de descuentos por familiar (30%), segunda actividad (40%), códigos de referidos y becas (50%-100%). Se asignan desde la ficha del alumno.
- **Eventos**: Crear eventos (carreras, clínicas, campus). Los alumnos pueden inscribirse y pagar.
- **Entrenamientos**: Plan mensual de entrenamientos por grupo. Se importan desde Excel y se publican por mes.
- **Coaches**: Gestión de coaches, agenda grupal, liquidaciones mensuales.
- **Turnera**: Sistema de reserva de turnos individuales con coaches.
- **Sedes**: Gestión de sedes/ubicaciones.
- **Tienda**: Productos, categorías, stock, pedidos, banners y promociones.
- **Depósito**: Gestión de stock con alertas y movimientos.
- **Facturación**: Emisión de facturas AFIP (emisores fiscales, comprobantes).
- **Gastos**: Registro de gastos operativos del negocio.
- **Liquidaciones**: Cálculo y pago de honorarios a coaches.
- **Auditoría**: Log de todas las acciones realizadas en el sistema.
- **Mejoras**: Canal de comunicación con el equipo de desarrollo + este asistente AI.

## Panel Alumno
- Ver su plan y suscripción activa
- Ver entrenamientos del mes
- Registrar sesiones completadas
- Ver progreso mensual
- Inscribirse a eventos
- Ver descuentos aplicados
- Acceder a la tienda

## Panel Coach
- Ver alumnos de sus grupos
- Registrar asistencia
- Dar feedback a alumnos
- Ver su agenda grupal
- Ver sus liquidaciones

Si el admin pregunta algo que no sabés con certeza, sugerí que contacte al equipo de desarrollo a través del Canal de Mejoras.
Si el admin propone una mejora o nueva funcionalidad, indicale que puede guardarla como sugerencia usando el botón "Guardar como mejora" que aparece en el chat.

Respondé siempre en español, de forma clara y concisa.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiadas solicitudes. Intentá de nuevo en unos segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos agotados. Contactá al equipo de desarrollo." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Error del servicio AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("admin-ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
