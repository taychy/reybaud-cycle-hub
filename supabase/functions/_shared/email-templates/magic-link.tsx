/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
  token?: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu código de acceso a Ciclismo Reybaud{token ? `: ${token}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="Ciclismo Reybaud" width="60" height="60" style={logo} />
        <Heading style={h1}>Tu código de acceso</Heading>

        {token ? (
          <>
            <Text style={text}>
              Ingresá este código en la app para acceder a Ciclismo Reybaud:
            </Text>
            <Text style={codeStyle}>{token}</Text>
            <Text style={expireNote}>
              Este código vence en unos minutos.
            </Text>
            <Text style={dividerText}>
              ─────────
            </Text>
            <Text style={altText}>
              También podés ingresar tocando este enlace:
            </Text>
            <Button style={buttonSecondary} href={confirmationUrl}>
              Ingresar con enlace
            </Button>
          </>
        ) : (
          <>
            <Text style={text}>
              Hacé clic en el botón para ingresar a Ciclismo Reybaud. Este link expira en breve.
            </Text>
            <Button style={button} href={confirmationUrl}>
              Ingresar
            </Button>
          </>
        )}

        <Text style={footer}>
          Si no solicitaste este acceso, podés ignorar este email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const LOGO_URL = 'https://tgqfakfloonbunwkdoug.supabase.co/storage/v1/object/public/email-assets/logo.png'
const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '480px', margin: '0 auto' }
const logo = { margin: '0 auto 20px', display: 'block' as const }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  fontFamily: "'Oswald', Arial, sans-serif",
  color: '#1A1A1A',
  margin: '0 0 20px',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
}
const text = {
  fontSize: '14px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0 0 20px',
  textAlign: 'center' as const,
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  color: '#E8832A',
  margin: '0 0 10px',
  textAlign: 'center' as const,
  letterSpacing: '6px',
}
const expireNote = {
  fontSize: '12px',
  color: '#999999',
  textAlign: 'center' as const,
  margin: '0 0 25px',
}
const dividerText = {
  fontSize: '12px',
  color: '#CCCCCC',
  textAlign: 'center' as const,
  margin: '0 0 15px',
}
const altText = {
  fontSize: '13px',
  color: '#888888',
  textAlign: 'center' as const,
  margin: '0 0 15px',
}
const button = {
  backgroundColor: '#E8832A',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'block' as const,
  textAlign: 'center' as const,
}
const buttonSecondary = {
  backgroundColor: '#f5f5f5',
  color: '#555555',
  fontSize: '13px',
  fontWeight: '600' as const,
  borderRadius: '8px',
  padding: '10px 20px',
  textDecoration: 'none',
  display: 'block' as const,
  textAlign: 'center' as const,
  border: '1px solid #dddddd',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0', textAlign: 'center' as const }
