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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  userType?: string
}

const ROLE_CONFIG: Record<string, { heading: string; preview: string; description: string; panel: string }> = {
  admin: {
    heading: '¡Bienvenido al equipo!',
    preview: 'Fuiste invitado como Administrador – Reybaud',
    description: 'Fuiste invitado a formar parte del equipo de administración de',
    panel: 'panel de administración',
  },
  alumno: {
    heading: '¡Bienvenido a Ciclismo Reybaud!',
    preview: 'Activá tu cuenta – Ciclismo Reybaud',
    description: 'Tu cuenta en Ciclismo Reybaud ya está lista. Solo falta que crees tu contraseña para empezar a acceder a tus entrenamientos en',
    panel: 'panel de entrenamientos',
  },
  coach: {
    heading: '¡Bienvenido al equipo de coaches!',
    preview: 'Activá tu cuenta de Coach – Ciclismo Reybaud',
    description: 'Tu cuenta como coach en Ciclismo Reybaud ya está habilitada. Creá tu contraseña para acceder a',
    panel: 'panel de coach',
  },
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  userType = 'admin',
}: InviteEmailProps) => {
  const config = ROLE_CONFIG[userType] || ROLE_CONFIG.admin

  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>{config.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt="Ciclismo Reybaud" width="60" height="60" style={logo} />
          <Heading style={h1}>{config.heading}</Heading>
          <Text style={text}>
            {config.description}{' '}
            <Link href={siteUrl} style={link}><strong>Ciclismo Reybaud</strong></Link>.
          </Text>
          <Text style={text}>
            Hacé clic en el botón de abajo para crear tu contraseña.
            Este enlace es válido por <strong>24 horas</strong>.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Crear mi contraseña
          </Button>
          <Text style={footerNote}>
            Una vez que crees tu contraseña, vas a poder acceder al {config.panel}{' '}
            con tu email y la clave que elijas.
          </Text>
          <Text style={footer}>
            Si no esperabas esta invitación, podés ignorar este email de forma segura.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default InviteEmail

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
  margin: '0 0 16px',
}
const link = { color: '#E8832A', textDecoration: 'underline' }
const button = {
  backgroundColor: '#E8832A',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'block' as const,
  textAlign: 'center' as const,
  margin: '8px 0 24px',
}
const footerNote = {
  fontSize: '13px',
  color: '#777777',
  lineHeight: '1.5',
  margin: '0 0 20px',
  borderTop: '1px solid #eeeeee',
  paddingTop: '16px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '0', textAlign: 'center' as const }
