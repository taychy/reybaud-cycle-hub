import { describe, expect, it } from "vitest";
import { getMpMovementDetail } from "./mpMovementDetails";

/** raw de una "Transferencia MP (web)" real: bank_info.collector viene vacío. */
const rawTransferenciaWeb = {
  operation_type: "money_transfer",
  description: "Varios",
  point_of_interaction: {
    business_info: { branch: "Transfers Intra MP Web", unit: "digital_accounts" },
    transaction_data: {
      type: "PSP_TRANSFER",
      bank_info: {
        collector: {
          account_alias: null,
          account_holder_name: null,
          account_id: null,
          identification: { number: null, type: null },
          long_name: null,
          transfer_account_id: null,
        },
        payer: { account_alias: null, account_id: null, long_name: null },
      },
    },
  },
};

/** raw hipotético con datos del destinatario (MP los expone cuando están disponibles). */
const rawTransferenciaConBeneficiario = {
  operation_type: "money_transfer",
  point_of_interaction: {
    business_info: { branch: "Intra MP" },
    transaction_data: {
      bank_info: {
        collector: {
          account_alias: "micuenta.mpago.me/destino",
          account_holder_name: "MARIA GOMEZ",
          account_id: "1234567890",
          identification: { number: "27234567894", type: "CUIT" },
        },
        payer: { account_holder_name: "CUENTA PROPIA" },
      },
    },
  },
};

describe("getMpMovementDetail — beneficiario de egresos", () => {
  it("Transferencia MP (web) sin datos del destinatario → beneficiario null (no inventar)", () => {
    const d = getMpMovementDetail({
      raw: rawTransferenciaWeb,
      description: "Varios",
      payer_name: "Claudio Reybaud",
    });
    expect(d.beneficiario).toBeNull();
    expect(d.beneficiario_doc).toBeNull();
    expect(d.beneficiario_cuenta).toBeNull();
    expect(d.operacion).toBe("Transferencia MP (web)");
    // El emisor nunca debe aparecer como beneficiario
    expect(d.contraparte).toBeNull();
  });

  it("Transferencia entre cuentas MP con collector completo → nombre, doc y cuenta destino", () => {
    const d = getMpMovementDetail({ raw: rawTransferenciaConBeneficiario });
    expect(d.beneficiario).toBe("MARIA GOMEZ");
    expect(d.beneficiario_doc).toBe("27234567894");
    expect(d.beneficiario_cuenta).toBe("micuenta.mpago.me/destino");
  });

  it("no usa payer_name / raw.payer (emisor) como beneficiario", () => {
    const d = getMpMovementDetail({
      raw: { ...rawTransferenciaConBeneficiario, transaction_details: { bank_info: { collector: {} } } },
      payer_name: "Claudio Reybaud",
    });
    expect(d.beneficiario).toBeNull();
    expect(d.contraparte).toBeNull();
  });
});
