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
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Confirmá tu cambio de email en Ciclismo Reybaud</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="Ciclismo Reybaud" width="60" height="60" style={logo} />
        <Heading style={h1}>Cambio de email</Heading>
        <Text style={text}>
          Solicitaste cambiar tu email de{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link>{' '}
          a{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>
          Hacé clic en el botón para confirmar el cambio:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar cambio de email
        </Button>
        <Text style={footer}>
          Si no solicitaste este cambio, asegurá tu cuenta de inmediato.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
  margin: '0 0 25px',
}
const link = { color: '#E8832A', textDecoration: 'underline' }
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
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0', textAlign: 'center' as const }
