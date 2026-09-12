import { useMemo, useState } from "react";
import { FlaskConical, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  calculateFiscalNet,
  FISCAL_DOCUMENT_TYPES,
  type FiscalDocumentClass,
  type SupportedFiscalDocumentType,
} from "@/lib/fiscal-comprobantes";

type TestDocument = {
  id: number;
  tipo: SupportedFiscalDocumentType;
  clase: FiscalDocumentClass;
  importe_total: number;
};

const INITIAL_DOCUMENTS: TestDocument[] = [
  { id: 1, tipo: 11, clase: "factura", importe_total: 125000 },
  { id: 2, tipo: 11, clase: "factura", importe_total: 80000 },
  { id: 3, tipo: 13, clase: "nota_credito", importe_total: 25000 },
];

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export function FiscalComprobantesLab() {
  const [documents, setDocuments] = useState<TestDocument[]>(INITIAL_DOCUMENTS);
  const [tipo, setTipo] = useState<SupportedFiscalDocumentType>(11);
  const [importe, setImporte] = useState("100000");

  const totals = useMemo(() => {
    const facturas = documents
      .filter((document) => document.clase === "factura")
      .reduce((sum, document) => sum + document.importe_total, 0);
    const notasCredito = documents
      .filter((document) => document.clase === "nota_credito")
      .reduce((sum, document) => sum + document.importe_total, 0);
    return {
      facturas,
      notasCredito,
      neto: calculateFiscalNet(documents),
    };
  }, [documents]);

  const addDocument = () => {
    const amount = Number(importe.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const info = FISCAL_DOCUMENT_TYPES[tipo];
    setDocuments((current) => [
      ...current,
      {
        id: Date.now(),
        tipo,
        clase: info.clase,
        importe_total: amount,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
        <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">Laboratorio fiscal — modo seguro</p>
          <p className="text-xs text-muted-foreground mt-1">
            Esta pantalla es solo para probar la lógica. No guarda comprobantes, no modifica facturas y no envía nada a ARCA.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Facturas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold tabular-nums">{money.format(totals.facturas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Notas de crédito</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold tabular-nums">-{money.format(totals.notasCredito)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Neto fiscal</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold tabular-nums">{money.format(totals.neto)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Simular comprobante</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={String(tipo)} onValueChange={(value) => setTipo(Number(value) as SupportedFiscalDocumentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 6, 11, 3, 8, 13].map((value) => {
                    const item = FISCAL_DOCUMENT_TYPES[value as SupportedFiscalDocumentType];
                    return <SelectItem key={value} value={String(value)}>{item.label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Importe</Label>
              <Input inputMode="decimal" value={importe} onChange={(event) => setImporte(event.target.value)} />
            </div>
            <Button type="button" onClick={addDocument}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
          </div>

          <div className="divide-y rounded-lg border">
            {documents.map((document) => {
              const info = FISCAL_DOCUMENT_TYPES[document.tipo];
              const isCredit = document.clase === "nota_credito";
              return (
                <div key={document.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{info.label}</span>
                  <span className="font-medium tabular-nums">{isCredit ? "−" : "+"}{money.format(document.importe_total)}</span>
                </div>
              );
            })}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => setDocuments(INITIAL_DOCUMENTS)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Reiniciar ejemplo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
