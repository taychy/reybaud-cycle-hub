import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

export default function BroadcastUnsubscribe() {
  const token = window.location.hash.slice(1);
  const valid = /^[a-f0-9]{64}$/.test(token);
  const [state,setState] = useState<'ready'|'busy'|'done'|'error'>(valid?'ready':'error');
  async function confirm() {
    if(state !== 'ready') return;
    setState('busy');
    const {data,error} = await supabase.rpc('unsubscribe_broadcast',{p_token:token});
    setState(!error && data === true ? 'done':'error');
  }
  return <main className="min-h-svh bg-background text-foreground flex items-center justify-center p-6"><section className="max-w-md space-y-6 text-center"><Mail className="mx-auto h-10 w-10 text-primary"/><h1 className="font-heading text-3xl">Comunicaciones Reybaud</h1><p className="text-muted-foreground">{state==='done'?'Tu baja quedó registrada. No recibirás más comunicaciones de mailing.':state==='error'?'El enlace no es válido o no pudo procesarse. Volvé a abrir el enlace del correo.':'Podés dejar de recibir comunicaciones de mailing. No necesitás iniciar sesión.'}</p>{(state==='ready'||state==='busy')&&<Button disabled={state==='busy'} onClick={()=>void confirm()}>{state==='busy'?'Registrando baja…':'Confirmar desuscripción'}</Button>}</section></main>;
}