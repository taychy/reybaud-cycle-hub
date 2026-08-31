import { describe, it, expect } from "vitest";
import {
  dedupeByMessageId,
  aggregateStatus,
  groupByDayAndTemplate,
  normalizeStatus,
  templateLabel,
  estadoDelDia,
  extraerSnapshot,
  type EmailLogRow,
} from "./emailLog";

const row = (o: Partial<EmailLogRow> & { id: string; created_at: string }): EmailLogRow => ({
  message_id: null,
  template_name: "installment_upcoming",
  recipient_email: "a@b.com",
  status: "sent",
  error_message: null,
  metadata: null,
  ...o,
});

describe("normalizeStatus", () => {
  it("mapea los estados crudos", () => {
    expect(normalizeStatus("sent")).toBe("enviado");
    expect(normalizeStatus("dlq")).toBe("fallo");
    expect(normalizeStatus("failed")).toBe("fallo");
    expect(normalizeStatus("suppressed")).toBe("suprimido");
    expect(normalizeStatus("pending")).toBe("pendiente");
    expect(normalizeStatus(null)).toBe("pendiente");
  });
});

describe("templateLabel", () => {
  it("usa el mapa y hace fallback legible", () => {
    expect(templateLabel("installment_overdue")).toBe("Aviso de cuota vencida");
    expect(templateLabel("algo_raro")).toBe("Algo raro");
    expect(templateLabel(null)).toBe("Email sin identificar");
  });
});

describe("dedupeByMessageId", () => {
  it("deja sólo la fila más reciente por message_id", () => {
    const rows = [
      row({ id: "1", message_id: "m1", status: "pending", created_at: "2026-08-01T10:00:00Z" }),
      row({ id: "2", message_id: "m1", status: "sent", created_at: "2026-08-01T10:00:05Z" }),
    ];
    const out = dedupeByMessageId(rows);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("2");
  });

  it("conserva las filas sin message_id", () => {
    const rows = [
      row({ id: "1", created_at: "2026-08-01T10:00:00Z" }),
      row({ id: "2", created_at: "2026-08-01T11:00:00Z" }),
    ];
    expect(dedupeByMessageId(rows)).toHaveLength(2);
  });
});

describe("aggregateStatus", () => {
  it("todos enviados => enviado", () => {
    expect(aggregateStatus(["enviado", "enviado"])).toBe("enviado");
  });
  it("todos fallidos => fallo", () => {
    expect(aggregateStatus(["fallo", "fallo"])).toBe("fallo");
  });
  it("mezcla => parcial", () => {
    expect(aggregateStatus(["enviado", "fallo"])).toBe("parcial");
    expect(aggregateStatus(["enviado", "pendiente"])).toBe("parcial");
  });
  it("vacío => pendiente", () => {
    expect(aggregateStatus([])).toBe("pendiente");
  });
});

describe("groupByDayAndTemplate", () => {
  const base = "2026-08-10T12:00:00";
  it("agrupa por día + plantilla y cuenta bien", () => {
    const rows = [
      row({ id: "1", message_id: "m1", status: "pending", created_at: `${base}Z` }),
      row({ id: "2", message_id: "m1", status: "sent", created_at: "2026-08-10T12:00:05Z" }),
      row({ id: "3", message_id: "m2", status: "dlq", created_at: "2026-08-10T12:01:00Z" }),
      row({ id: "4", message_id: "m3", template_name: "renewal_reminder", status: "sent", created_at: "2026-08-10T13:00:00Z" }),
    ];
    const evs = groupByDayAndTemplate(rows);
    const cuotas = evs.find((e) => e.templateName === "installment_upcoming")!;
    expect(cuotas.total).toBe(2);
    expect(cuotas.enviados).toBe(1);
    expect(cuotas.fallidos).toBe(1);
    expect(cuotas.estado).toBe("parcial");
    expect(evs.find((e) => e.templateName === "renewal_reminder")!.estado).toBe("enviado");
  });

  it("estadoDelDia refleja el peor caso", () => {
    const evs = groupByDayAndTemplate([
      row({ id: "1", message_id: "m1", status: "sent", created_at: "2026-08-10T12:00:00Z" }),
      row({ id: "2", message_id: "m2", template_name: "renewal_reminder", status: "dlq", created_at: "2026-08-10T12:00:00Z" }),
    ]);
    expect(estadoDelDia(evs)).toBe("parcial");
    expect(estadoDelDia([])).toBe("pendiente");
  });
});

describe("extraerSnapshot", () => {
  it("devuelve null sin contenido histórico", () => {
    expect(extraerSnapshot(null)).toBeNull();
    expect(extraerSnapshot({ foo: 1 })).toBeNull();
  });
  it("lee snapshot anidado o plano", () => {
    expect(extraerSnapshot({ snapshot: { subject: "Hola", html: "<p>hi</p>" } })).toEqual({
      subject: "Hola",
      html: "<p>hi</p>",
      text: null,
    });
    expect(extraerSnapshot({ subject: "Hola" })?.subject).toBe("Hola");
  });
});
