// Edge Function delete-account : supprime définitivement le compte du pilote connecté (RGPD).
//
// Appel (depuis l'app, utilisateur connecté) :
//   POST { confirm: "SUPPRIMER" }
// Réponse :
//   200 { ok: true }
//   4xx { ok: false, code }   (UNAUTHORIZED, BAD_REQUEST, LAST_ADMIN)
//
// Étapes : prepare_account_deletion (dernier admin refusé, écurie transmise, liste des fichiers), effacement des
// fichiers du stockage, puis suppression de l'utilisateur : le profil et toutes ses données partent en cascade.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'BAD_REQUEST' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { ok: false, code: 'UNAUTHORIZED' });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json(401, { ok: false, code: 'UNAUTHORIZED' });
  const userId = auth.user.id;

  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== 'SUPPRIMER') return json(400, { ok: false, code: 'BAD_REQUEST' });

  const { data: files, error: prepError } = await admin.rpc('prepare_account_deletion', { p_profile: userId });
  if (prepError) {
    if (prepError.message.includes('last app admin')) return json(409, { ok: false, code: 'LAST_ADMIN' });
    throw prepError;
  }

  // Fichiers du pilote, par bucket et par lots (l'API de stockage accepte 1 000 chemins par appel).
  const byBucket = new Map<string, string[]>();
  for (const f of (files ?? []) as { bucket: string; path: string }[]) {
    byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
  }
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 1000) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 1000));
      if (error) console.error('storage cleanup', bucket, error.message);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
  return json(200, { ok: true });
});
