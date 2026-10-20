import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Aviso operativo individual al titular de una reserva vigente (no marketing).
export const RESCHEDULING_TEMPLATE_VERSION = 'san-luis-nov-2026-v1'

interface Props {
  firstName?: string
  link?: string
}

const ReschedulingChoiceEmail = ({ firstName, link = 'https://reybaud-app.com' }: Props) => (
  <Html lang="es">
    <Head />
    <Preview>Elegí cómo querés continuar con tu reserva del Training Camp San Luis</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h2}>Training Camp San Luis</Heading>
        <Text style={p}>Hola {firstName ? <strong>{firstName}</strong> : ''}:</Text>
        <Text style={p}>
          El Training Camp San Luis se reprogramó del 5 al 9 de noviembre de 2026, en el mismo alojamiento. Queremos que elijas cómo seguir:
        </Text>
        <Text style={li}>• Viajar en noviembre: del 5 al 8, del 6 al 9 o del 5 al 9.</Text>
        <Text style={li}>• Pedir la devolución del 100% de lo que efectivamente abonaste, menos reintegros previos.</Text>
        <Text style={li}>• Pedir un crédito nominal en pesos para otro Training Camp.</Text>
        <Text style={li}>• Si tenés dudas, también podés pedir ayuda antes de elegir.</Text>
        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={link} style={button}>Elegir mi opción</Button>
        </Section>
        <Text style={hint}>
          El botón te lleva directo a tu reserva. Si no iniciaste sesión, te pediremos tu DNI, nombre y apellido para confirmar que sos vos.
        </Text>
        <Text style={hint}>
          Tu elección registra un pedido para revisión del equipo: no realiza pagos ni devoluciones, no libera lugares y no modifica tu reserva por sí sola.
        </Text>
        <Text style={footer}>Equipo Ciclismo Reybaud</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ReschedulingChoiceEmail,
  subject: 'Training Camp San Luis · Elegí cómo querés continuar',
  displayName: 'San Luis · Reprogramación (elección personal)',
  previewData: { firstName: 'Nombre', link: 'https://reybaud-app.com/reprogramacion/ejemplo' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h2 = { fontSize: '22px', color: '#111111', margin: '0 0 16px' }
const p = { fontSize: '15px', lineHeight: '22px', color: '#222222' }
const li = { fontSize: '15px', lineHeight: '22px', color: '#222222', margin: '4px 0' }
const button = { backgroundColor: '#f07a1a', color: '#ffffff', padding: '12px 22px', borderRadius: '6px', fontWeight: 'bold', textDecoration: 'none' }
const hint = { fontSize: '13px', lineHeight: '19px', color: '#555555' }
const footer = { fontSize: '13px', color: '#777777', marginTop: '24px' }
