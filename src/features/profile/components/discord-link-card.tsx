import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { confirmAction } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

type Link = { discord_id?: string; linked_at?: string };
type Code = { code: string; expires_at: string };

export function DiscordLinkCard({ profileId }: { profileId: string }) {
  const client = useQueryClient();
  const key = ['discord-link', profileId];
  // One-use codes are never persisted in query cache or device storage.
  const [code, setCode] = useState<Code | null>(null);
  const link = useQuery({ queryKey: key, queryFn: async () => {
    const { data, error } = await supabase.rpc('my_discord_link');
    if (error) throw error;
    return data as Link;
  }, refetchInterval: (query) => code && Date.parse(code.expires_at) > Date.now() && !query.state.data?.discord_id ? 5000 : false });
  const generate = useMutation({ mutationFn: async () => {
    const { data, error } = await supabase.rpc('create_discord_link_code');
    if (error) throw error;
    setCode(data as Code);
  } });
  const unlink = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc('unlink_my_discord');
    if (error) throw error;
  }, onSuccess: () => { setCode(null); void client.invalidateQueries({ queryKey: key }); } });
  const error = generate.error ?? unlink.error;
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text variant="heading">Mon compte Discord</Text>
      {link.isPending ? <Text variant="caption">Vérification de la liaison…</Text> : link.isError ? (
        <>
          <Text variant="caption">La liaison Discord est momentanément indisponible.</Text>
          <Button title="Réessayer" variant="secondary" onPress={() => { void link.refetch(); }} />
        </>
      ) : link.data?.discord_id ? (
        <>
          <Text>Ton compte Discord est lié.</Text>
          <Text variant="caption" selectable>Identifiant Discord : {link.data.discord_id}</Text>
          <Text variant="caption">Utilise /profil ou /mesrecords sans saisir ton pseudo. Ton réglage de visibilité reste appliqué.</Text>
          <Button title="Dissocier Discord" variant="ghost" loading={unlink.isPending}
            onPress={() => confirmAction('Dissocier Discord ?', 'Le bot ne retrouvera plus automatiquement ton profil.', 'Dissocier', () => unlink.mutate())} />
        </>
      ) : (
        <>
          <Text variant="caption">Retrouve tes statistiques et tes records sur Discord sans retaper ton pseudo.</Text>
          {code ? (
            <>
              <Text variant="caption">Dans le serveur Kart Rivals, lance /lier et colle ce code dans l’option code. Ne le partage avec personne.</Text>
              <Text variant="mono" selectable>{code.code}</Text>
              <Text variant="caption">Valable jusqu’à {new Date(code.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (10 minutes), une seule fois. Un nouveau code remplace le précédent.</Text>
            </>
          ) : null}
          <Button title={code ? 'Générer un nouveau code' : 'Lier mon compte Discord'} loading={generate.isPending} onPress={() => generate.mutate()} />
          <Text variant="caption">Seules les données de ton profil public seront affichées par les commandes du bot.</Text>
        </>
      )}
      {error ? <Text style={{ color: colors.danger }}>{error.message}</Text> : null}
    </Card>
  );
}
