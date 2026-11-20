// Edge Function admin-reset-profile : l'équipe Kart Rivals réinitialise le pseudo et/ou la photo d'un pilote.
//
// Appel (depuis l'app, membre de l'équipe connecté) :
//   POST { pilot_id: uuid, what: "username" | "avatar" | "both", reason: string }
// Réponse :
//   200 { ok: true, username, avatar_removed, files_ok }
//   4xx { ok: false, code }   (UNAUTHORIZED, BAD_REQUEST, FORBIDDEN, NOT_FOUND, REASON_REQUIRED, FAILED)
//
// L'autorisation se décide en base : admin_reset_pilot_profile est appelée avec le jeton de l'appelant, elle exige un
// membre de l'équipe, remplace le pseudo, retire la photo du profil, trace l'action et prévient le pilote. Seulement
// ensuite, ici, les fichiers du pilote sont effacés du bucket public « avatars » avec la clé de service : l'API de
// stockage est la seule façon de supprimer vraiment un fichier, sans quoi l'image resterait accessible par son adresse.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'BAD_REQUEST' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { ok: false, code: 'UNAUTHORIZED' });
  const { data: auth, error: authError } = await service.auth.getUser(token);
  if (authError || !auth.user) return json(401, { ok: false, code: 'UNAUTHORIZED' });

  const body = (await req.json().catch(() => null)) as { pilot_id?: unknown; what?: unknown; reason?: unknown } | null;
  const pilotId = typeof body?.pilot_id === 'string' ? body.pilot_id : '';
  const what = body?.what;
  const reason = typeof body?.reason === 'string' ? body.reason : '';
  if (!UUID.test(pilotId) || (what !== 'username' && what !== 'avatar' && what !== 'both')) {
    return json(400, { ok: false, code: 'BAD_REQUEST' });
  }

  // Appel avec le jeton de l'équipe : auth.uid() est l'appelant, la base vérifie son rôle.
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await asCaller.rpc('admin_reset_pilot_profile', { p_profile: pilotId, p_what: what, p_reason: reason });
  if (error) {
    const message = error.message;
    if (message.includes('Only the Kart Rivals team') || message.includes('Only app admins')) return json(403, { ok: false, code: 'FORBIDDEN' });
    if (message.includes('Pilot not found')) return json(404, { ok: false, code: 'NOT_FOUND' });
    if (message.includes('A reason is required')) return json(400, { ok: false, code: 'REASON_REQUIRED' });
    console.error('admin_reset_pilot_profile', message);
    return json(400, { ok: false, code: 'FAILED' });
  }

  const result = data as { username: string | null; avatar_cleared: boolean; avatar_files: string[] };
  // La base est déjà à jour : un échec de nettoyage est signalé (files_ok: false) sans annuler la réinitialisation.
  let filesOk = true;
  if (result.avatar_cleared && result.avatar_files.length > 0) {
    const { error: removeError } = await service.storage.from('avatars').remove(result.avatar_files);
    if (removeError) {
      console.error('avatar cleanup', pilotId, removeError.message);
      filesOk = false;
    }
  }

  return json(200, {
    ok: true,
    username: result.username,
    avatar_removed: result.avatar_cleared,
    files_ok: filesOk,
  });
});
