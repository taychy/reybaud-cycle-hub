import LegacyAdminPayments from "./AdminPaymentsLegacy";

/**
 * Presentational wrapper for Pagos > Suscripciones.
 *
 * We intentionally keep the existing payment/subscription logic untouched and
 * only simplify the Suscripciones tab visually: no admin-check UI, no action
 * column, denser rows, and more room for the useful fields.
 */
const AdminPayments = () => {
  return (
    <div className="admin-payments-clean-view">
      <style>{`
        /* Scope every override to the Radix tab panel for "suscripciones". */
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
          > .grid.grid-cols-1.md\\:grid-cols-3.gap-3
          > :nth-child(3) {
          display: none !important;
        }

        @media (min-width: 768px) {
          .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
            > .grid.grid-cols-1.md\\:grid-cols-3.gap-3 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        /* Hide the "Chequeo admin" filter (6th item in this tab's filter grid). */
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
          .grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4.gap-3
          > :nth-child(6) {
          display: none !important;
        }

        /* Hide the Acciones column completely, including its controls. */
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
          table thead th:nth-child(8),
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
          table tbody > tr > td:nth-child(8):not([colspan]) {
          display: none !important;
        }

        /* Compact the normal subscription rows, while leaving expanded detail rows intact. */
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
          table tbody > tr > td:not([colspan]) {
          padding-top: 0.625rem !important;
          padding-bottom: 0.625rem !important;
        }

        /* Chequeo is no longer part of this view, so rows do not get a green checked tint. */
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
          table tbody > tr.bg-emerald-500\\/10 {
          background-color: transparent !important;
        }
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"]
          table tbody > tr.bg-emerald-500\\/10:hover {
          background-color: hsl(var(--muted) / 0.5) !important;
        }

        /* Reuse the freed space for Alumno, Plan and Método. */
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"] table thead th:nth-child(1) { width: 2.5rem; }
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"] table thead th:nth-child(2) { width: 23%; }
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"] table thead th:nth-child(3) { width: 22%; }
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"] table thead th:nth-child(4) { width: 13%; }
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"] table thead th:nth-child(5) { width: 13%; }
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"] table thead th:nth-child(6) { width: 11%; }
        .admin-payments-clean-view [role="tabpanel"][id$="-content-suscripciones"] table thead th:nth-child(7) { width: 18%; }
      `}</style>
      <LegacyAdminPayments />
    </div>
  );
};

export default AdminPayments;
