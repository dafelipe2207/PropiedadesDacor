// Crea el acceso de un inquilino o propietario y le envía una invitación por correo.
// Solo la puede usar el administrador. Usa la service role key, que nunca sale del servidor.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: esAdmin, error: e1 } = await comoUsuario.rpc('es_admin');
    if (e1 || !esAdmin) return responder({ error: 'Solo el administrador puede crear usuarios' }, 403);

    const { correo, rol, propietario_id = null, inquilino_id = null, redirigir = null } = await req.json();
    if (!correo || !['inquilino', 'propietario'].includes(rol)) return responder({ error: 'Datos incompletos' }, 400);
    if (rol === 'inquilino' && !inquilino_id) return responder({ error: 'Falta el inquilino' }, 400);
    if (rol === 'propietario' && !propietario_id) return responder({ error: 'Falta el propietario' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error: e2 } = await admin.auth.admin.inviteUserByEmail(correo, redirigir ? { redirectTo: redirigir } : undefined);
    if (e2) return responder({ error: /already/i.test(e2.message) ? 'Ya existe un usuario con ese correo' : e2.message }, 400);

    const { error: e3 } = await admin.from('perfiles').insert({ id: data.user.id, rol, propietario_id, inquilino_id });
    if (e3) {
      await admin.auth.admin.deleteUser(data.user.id);
      return responder({ error: e3.message }, 400);
    }
    return responder({ id: data.user.id });
  } catch (e) {
    return responder({ error: String(e?.message ?? e) }, 500);
  }
});
