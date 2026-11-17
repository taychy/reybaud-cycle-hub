/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Button,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  token: string
  confirmationUrl?: string
}

export const MagicLinkEmail = ({
  siteName,
  token,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu código de acceso para {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Tu código de acceso</Heading>
        <Text style={text}>
          Ingresá este código en {siteName} para acceder a tu cuenta:
        </Text>
        <Text style={code}>{token}</Text>
        {confirmationUrl && (
          <>
            <Text style={text}>También podés ingresar directamente desde este botón:</Text>
            <Button href={confirmationUrl} style={accessButton}>Ingresar a Reybaud</Button>
          </>
        )}
        <Text style={text}>
          {confirmationUrl ? 'El código y el enlace vencerán en pocos minutos.' : 'El código vencerá en pocos minutos.'}
        </Text>
        <Text style={footer}>
          Si no solicitaste este acceso, podés ignorar este email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const code = {
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '6px',
  color: '#000000',
  margin: '8px 0 24px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }

const accessButton = { backgroundColor: '#b7934a', color: '#171717', padding: '12px 22px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold' as const, textDecoration: 'none' }
