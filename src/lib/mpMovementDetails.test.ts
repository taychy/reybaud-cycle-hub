import { describe, expect, it } from "vitest";
import { getMpMovementDetail } from "./mpMovementDetails";

describe("identificación de destinatarios Mercado Pago", () => {
  it("no inventa beneficiarios cuando MP sólo informa al pagador", () => {
    const detail = getMpMovementDetail({
      description: "Varios",
      payer_name: "Titular de la cuenta emisora",
      raw: {
        payer: { first_name: "Cuenta", last_name: "Emisora" },
        point_of_interaction: {
          transaction_data: {
            bank_info: { collector: {
              account_holder_name: null, long_name: null, account_alias: null,
            } },
          },
        },
      },
    });
    expect(detail.beneficiario).toBeNull();
    expect(detail.concepto).toBeNull();
  });

  it("usa el beneficiario del comprobante de MP cuando sí viene informado", () => {
    const detail = getMpMovementDetail({
      raw: {
        point_of_interaction: {
          transaction_data: {
            bank_info: {
              collector: {
                account_holder_name: "Destinatario de prueba",
                identification: { number: "12345678" },
                account_alias: "destino.ejemplo",
              },
            },
          },
        },
        payer: { first_name: "Emisor" },
      },
    });
    expect(detail.beneficiario).toBe("Destinatario de prueba");
    expect(detail.beneficiario_doc).toBe("12345678");
    expect(detail.beneficiario_cuenta).toBe("destino.ejemplo");
  });
});
