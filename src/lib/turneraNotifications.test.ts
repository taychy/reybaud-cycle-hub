import { describe, it, expect } from "vitest";
import { buildComunicaciones, type NotifRow } from "@/components/admin/TurneraComunicacionesCell";

const reserva = {
  id: "r1",
  fecha: "2999-01-10",
  hora_inicio: "10:00",
  created_at: "2999-01-01T00:00:00Z",
  estado_operativo: "reservada",
};

const log = (p: Partial<NotifRow> & Pick<NotifRow, "tipo" | "canal" | "estado">): NotifRow => ({
  error_message: null, error_code: null, queued_at: null, sent_at: null,
  failed_at: null, scheduled_for: null, ...p,
});

const find = (items: ReturnType<typeof buildComunicaciones>, tipo: string, canal: string) =>
  items.find(i => i.tipo === tipo && i.canal === canal)!;

describe("comunicaciones de turnera por canal", () => {
  it("WhatsApp queda desactivado cuando el servicio no lo habilita", () => {
    const items = buildComunicaciones(reserva, { recordatorio_horas_antes: 24 }, []);
    expect(find(items, "Recordatorio al alumno", "WhatsApp").estado).toBe("desactivado");
  });

  it("muestra 'No configurado' cuando el worker registró un skip", () => {
    const items = buildComunicaciones(
      reserva,
      { whatsapp_recordatorio_enabled: true, recordatorio_horas_antes: 24 },
      [log({ tipo: "recordatorio", canal: "whatsapp", estado: "skipped", error_message: "No configurado: falta TWILIO_API_KEY" })],
    );
    const wa = find(items, "Recordatorio al alumno", "WhatsApp");
    expect(wa.estado).toBe("no_configurado");
    expect(wa.detalle).toContain("TWILIO_API_KEY");
  });

  it("expone el error real del proveedor sin marcar enviado", () => {
    const items = buildComunicaciones(
      reserva,
      { whatsapp_coach_recordatorio_enabled: true },
      [log({ tipo: "coach_recordatorio", canal: "whatsapp", estado: "error", error_code: "20003", error_message: "Trial account", failed_at: "2999-01-09T10:00:00Z" })],
    );
    const wa = find(items, "Recordatorio al coach", "WhatsApp");
    expect(wa.estado).toBe("error");
    expect(wa.detalle).toContain("20003");
  });

  it("el email sigue reportando su propio estado aunque WhatsApp falle", () => {
    const items = buildComunicaciones(
      reserva,
      { whatsapp_recordatorio_enabled: true, recordatorio_horas_antes: 24 },
      [
        log({ tipo: "recordatorio", canal: "email", estado: "sent", sent_at: "2999-01-09T10:00:00Z" }),
        log({ tipo: "recordatorio", canal: "whatsapp", estado: "error", error_code: "500", error_message: "boom" }),
      ],
    );
    expect(find(items, "Recordatorio al alumno", "Email").estado).toBe("enviado");
    expect(find(items, "Recordatorio al alumno", "WhatsApp").estado).toBe("error");
  });

  it("no marca 'enviado' un email que sólo fue encolado", () => {
    const items = buildComunicaciones(
      reserva,
      { recordatorio_horas_antes: 24 },
      [log({ tipo: "recordatorio", canal: "email", estado: "queued", queued_at: "2999-01-09T10:00:00Z" })],
    );
    expect(find(items, "Recordatorio al alumno", "Email").estado).toBe("en_cola");
  });

  it("un recordatorio futuro sin registro aparece como programado", () => {
    const items = buildComunicaciones(
      reserva,
      { whatsapp_recordatorio_enabled: true, recordatorio_horas_antes: 24 },
      [],
    );
    expect(find(items, "Recordatorio al alumno", "WhatsApp").estado).toBe("programado");
  });
});
