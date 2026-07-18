import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const BodySchema = z.object({
  nombre: z.string().trim().max(120).optional().nullable(),
  apellido: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  telefono: z.string().trim().max(40).optional().nullable(),
  notas: z.string().trim().max(2000).optional().nullable(),
});

function normalizeArPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = String(input).replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  while (d.startsWith('0')) d = d.slice(1);
  if (d.length > 10) {
    for (const a of [2, 3, 4]) {
      if (d.length - a >= 8 && d.substring(a, a + 2) === '15') {
        const c = d.substring(0, a) + d.substring(a + 2);
        if (c.length === 10) { d = c; break; }
      }
    }
  }
  if (d.length < 10 || d.length > 11) return null;
  return '549' + d.slice(-10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const user = userRes.user;

    const admin = createClient(supabaseUrl, serviceKey);
    // Authz: admin role
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'super_admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { nombre, apellido, notas } = parsed.data;
    const email = parsed.data.email?.toLowerCase() || null;
    const telefono = parsed.data.telefono || null;
    const telNorm = normalizeArPhone(telefono);

    if (!email && !telNorm) {
      return new Response(JSON.stringify({ error: 'email o teléfono requerido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Try to match existing alumno
    let alumnoId: string | null = null;
    if (telNorm) {
      const last10 = telNorm.slice(-10);
      const { data } = await admin.rpc('find_alumno_by_phone_last10', { last10 }).maybeSingle().then((r: any) => r).catch(() => ({ data: null }));
      if (data?.id) alumnoId = data.id;
      if (!alumnoId) {
        // Fallback: fetch and compare last10 digits in JS
        const { data: rows } = await admin.from('alumnos').select('id, telefono').not('telefono', 'is', null).limit(5000);
        const match = (rows ?? []).find((r: any) => {
          const d = String(r.telefono ?? '').replace(/\D/g, '');
          return d.length >= 10 && d.slice(-10) === last10;
        });
        if (match) alumnoId = match.id;
      }
    }
    if (!alumnoId && email) {
      const { data } = await admin.from('alumnos').select('id').ilike('email', email).limit(1).maybeSingle();
      if (data?.id) alumnoId = data.id;
    }

    // Upsert into marketing_contacts. Match key: email (unique) or telefono_normalizado (unique partial).
    let existing: any = null;
    if (email) {
      const { data } = await admin.from('marketing_contacts').select('*').eq('email', email).limit(1).maybeSingle();
      if (data) existing = data;
    }
    if (!existing && telNorm) {
      const { data } = await admin.from('marketing_contacts').select('*').eq('telefono_normalizado', telNorm).limit(1).maybeSingle();
      if (data) existing = data;
    }

    const payload: any = {
      nombre: nombre || existing?.nombre || null,
      apellido: apellido || existing?.apellido || null,
      email: email || existing?.email || `wa_${telNorm}@sin-email.local`,
      telefono: telefono || existing?.telefono || null,
      tipo: 'whatsapp_web',
      origen: 'whatsapp_web',
      notas: notas ? (existing?.notas ? `${existing.notas}\n---\n${notas}` : notas) : existing?.notas || null,
      capturado_por_id: user.id,
      capturado_por_email: user.email ?? null,
      alumno_id: alumnoId,
      created_by: user.id,
    };

    let contactId: string;
    if (existing) {
      const { data, error } = await admin.from('marketing_contacts').update(payload).eq('id', existing.id).select('id').single();
      if (error) throw error;
      contactId = data.id;
    } else {
      const { data, error } = await admin.from('marketing_contacts').insert(payload).select('id').single();
      if (error) throw error;
      contactId = data.id;
    }

    // Activity log if linked to an alumno
    if (alumnoId) {
      try {
        await admin.from('student_activity_log').insert({
          alumno_id: alumnoId,
          event_type: 'contacto_whatsapp',
          title: `Contacto WhatsApp registrado`,
          description: `Registrado por ${user.email ?? 'staff'}${notas ? ': ' + notas.slice(0, 300) : ''}`,
          actor_id: user.id,
          actor_email: user.email ?? null,
          actor_role: 'admin',
        });
      } catch (_) { /* best-effort */ }
    }

    return new Response(JSON.stringify({
      status: alumnoId ? 'alumno' : 'prospecto',
      contact_id: contactId,
      alumno_id: alumnoId,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('register-whatsapp-contact error', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'internal_error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
