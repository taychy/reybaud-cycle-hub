import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Item {
  producto_nombre: string
  variante?: Record<string, string>
  cantidad_pedida: number
  precio_unitario?: number | null
  notas?: string | null
}

interface Props {
  proveedorNombre?: string
  numero?: string
  fechaPedido?: string
  fechaEta?: string | null
  moneda?: string
  totalEstimado?: number
  notas?: string | null
  items?: Item[]
  contactoNombre?: string
  contactoTelefono?: string
}

const fmt = (n: number, moneda = 'ARS') =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda }).format(n || 0)

const variantLabel = (v?: Record<string, string>) => {
  if (!v) return ''
  const parts = Object.entries(v).filter(([, val]) => val)
  return parts.length ? ` — ${parts.map(([, val]) => val).join(' / ')}` : ''
}

const SupplierOrderEmail = ({
  proveedorNombre = 'Proveedor',
  numero = '',
  fechaPedido = '',
  fechaEta = '',
  moneda = 'ARS',
  totalEstimado = 0,
  notas = '',
  items = [],
  contactoNombre = 'Equipo Reybaud',
  contactoTelefono = '',
}: Props) => (
  <Html lang="es">
    <Head />
    <Preview>Nuevo pedido {numero} — Ciclismo Reybaud</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h2}>🧾 Nuevo pedido de compra</Heading>
        <Text style={paragraph}>
          Hola <strong>{proveedorNombre}</strong>, te compartimos el detalle de un nuevo pedido.
        </Text>

        <Section style={info}>
          <Text style={infoRow}><strong>Pedido:</strong> {numero || '—'}</Text>
          <Text style={infoRow}><strong>Fecha:</strong> {fechaPedido || '—'}</Text>
          {fechaEta ? <Text style={infoRow}><strong>Entrega estimada:</strong> {fechaEta}</Text> : null}
          <Text style={infoRow}><strong>Moneda:</strong> {moneda}</Text>
        </Section>

        <Heading as="h3" style={h3}>Ítems</Heading>
        <Section>
          {items.map((it, i) => (
            <Section key={i} style={itemRow}>
              <Text style={itemName}>
                {it.cantidad_pedida}× {it.producto_nombre}{variantLabel(it.variante)}
              </Text>
              {it.precio_unitario != null ? (
                <Text style={itemSub}>
                  {fmt(it.precio_unitario, moneda)} c/u · Subtotal {fmt((it.precio_unitario || 0) * (it.cantidad_pedida || 0), moneda)}
                </Text>
              ) : null}
              {it.notas ? <Text style={itemNote}>Nota: {it.notas}</Text> : null}
            </Section>
          ))}
        </Section>

        {totalEstimado > 0 ? (
          <>
            <Hr style={hr} />
            <Text style={totalLine}><strong>Total estimado:</strong> {fmt(totalEstimado, moneda)}</Text>
          </>
        ) : null}

        {notas ? (
          <Section style={quote}>
            <Text style={quoteLabel}>Notas</Text>
            <Text style={quoteBody}>{notas}</Text>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={paragraph}>
          Por cualquier consulta podés responder este mail o contactarte con{' '}
          <strong>{contactoNombre}</strong>{contactoTelefono ? ` (${contactoTelefono})` : ''}.
        </Text>
        <Text style={footer}>Ciclismo Reybaud — Escuela de ciclismo</Text>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
}
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const h2 = { color: '#d4820a', marginBottom: '12px', fontSize: '22px' }
const h3 = { color: '#222', fontSize: '15px', margin: '20px 0 8px' }
const paragraph = { color: '#333', fontSize: '15px', lineHeight: '1.5' }
const info = { backgroundColor: '#f7f4ef', padding: '12px 14px', borderRadius: '6px', margin: '12px 0' }
const infoRow = { margin: '2px 0', color: '#333', fontSize: '14px' }
const itemRow = { borderBottom: '1px solid #eee', padding: '8px 0' }
const itemName = { margin: '0', color: '#222', fontSize: '14px', fontWeight: 500 as const }
const itemSub = { margin: '2px 0 0', color: '#666', fontSize: '12px' }
const itemNote = { margin: '2px 0 0', color: '#8a5a12', fontSize: '12px', fontStyle: 'italic' as const }
const hr = { borderColor: '#eee', margin: '16px 0' }
const totalLine = { color: '#222', fontSize: '15px', textAlign: 'right' as const }
const quote = {
  backgroundColor: '#f7f4ef',
  borderLeft: '4px solid #d4820a',
  padding: '10px 14px',
  borderRadius: '6px',
  margin: '14px 0',
}
const quoteLabel = { margin: '0 0 4px', color: '#8a5a12', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
const quoteBody = { margin: '0', color: '#222', whiteSpace: 'pre-wrap' as const, fontSize: '14px' }
const footer = { color: '#999', fontSize: '12px', marginTop: '24px', textAlign: 'center' as const }

export const template = {
  component: SupplierOrderEmail,
  subject: (data: Props) => `🧾 Nuevo pedido ${data?.numero || ''} — Ciclismo Reybaud`.trim(),
  displayName: 'Pedido a proveedor',
  previewData: {
    proveedorNombre: 'Santini',
    numero: 'PED-000123',
    fechaPedido: '2026-07-23',
    fechaEta: '2026-08-15',
    moneda: 'USD',
    totalEstimado: 4200,
    notas: 'Entregar en depósito Reybaud, Palermo.',
    items: [
      { producto_nombre: 'Jersey Team', variante: { Talle: 'M' }, cantidad_pedida: 10, precio_unitario: 120 },
      { producto_nombre: 'Culotte Team', variante: { Talle: 'L' }, cantidad_pedida: 8, precio_unitario: 150 },
    ],
    contactoNombre: 'Equipo Reybaud',
  },
} satisfies TemplateEntry
