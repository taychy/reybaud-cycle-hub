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
  Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  coachName?: string
  tipoLabel?: string
  generalNote?: string
  detailCount?: number
  appUrl?: string
}

const CoachFeedbackEmail = ({
  firstName = 'Hola',
  coachName = 'Tu entrenador',
  tipoLabel = 'General',
  generalNote = '',
  detailCount = 0,
  appUrl = 'https://reybaud-app.com',
}: Props) => (
  <Html lang="es">
    <Head />
    <Preview>Nuevo feedback de {coachName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h2}>📝 Nuevo feedback</Heading>
        <Text style={paragraph}>
          Hola <strong>{firstName}</strong>, recibiste un feedback de{' '}
          <strong>{coachName}</strong>.
        </Text>
        <Section style={quote}>
          <Text style={quoteLabel}>{tipoLabel}</Text>
          <Text style={quoteBody}>{generalNote}</Text>
        </Section>
        {detailCount > 0 ? (
          <Text style={hint}>
            Tenés <strong>{detailCount} comentario{detailCount === 1 ? '' : 's'}</strong>{' '}
            por característica esperándote en la app.
          </Text>
        ) : null}
        <Section style={{ textAlign: 'center', marginTop: '20px' }}>
          <Button href={appUrl} style={button}>
            Ver detalle en la app
          </Button>
        </Section>
        <Text style={footer}>Ciclismo Reybaud — Escuela de ciclismo</Text>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
}
const container = { maxWidth: '520px', margin: '0 auto', padding: '24px' }
const h2 = { color: '#d4820a', marginBottom: '12px', fontSize: '22px' }
const paragraph = { color: '#333', fontSize: '15px', lineHeight: '1.5' }
const quote = {
  backgroundColor: '#f7f4ef',
  borderLeft: '4px solid #d4820a',
  padding: '14px 16px',
  borderRadius: '6px',
  margin: '16px 0',
}
const quoteLabel = {
  margin: '0 0 6px',
  color: '#8a5a12',
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
}
const quoteBody = {
  margin: '0',
  color: '#222',
  whiteSpace: 'pre-wrap' as const,
  fontSize: '15px',
  lineHeight: '1.5',
}
const hint = {
  margin: '14px 0 0',
  color: '#666',
  fontSize: '13px',
  textAlign: 'center' as const,
}
const button = {
  display: 'inline-block',
  padding: '12px 24px',
  backgroundColor: '#d4820a',
  color: '#ffffff',
  textDecoration: 'none',
  borderRadius: '8px',
  fontWeight: 600,
}
const footer = {
  color: '#999',
  fontSize: '12px',
  marginTop: '24px',
  textAlign: 'center' as const,
}

export const template = {
  component: CoachFeedbackEmail,
  subject: (data: Props) =>
    `📝 Nuevo feedback de ${data?.coachName || 'tu entrenador'}`,
  displayName: 'Feedback del coach',
  previewData: {
    firstName: 'Claudio',
    coachName: 'Nico',
    tipoLabel: 'Técnica',
    generalNote: 'Muy buen trabajo en la subida, seguí manteniendo la cadencia.',
    detailCount: 3,
    appUrl: 'https://reybaud-app.com',
  },
} satisfies TemplateEntry
