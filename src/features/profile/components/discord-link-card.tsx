import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

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
  const [now, setNow] = useState(() => Date.now());
  const link = useQuery({ queryKey: key, queryFn: async () => {
    const { data, error } = await supabase.rpc('my_discord_link');
    if (error) throw error;
    return data as Link;
  }, refetchInterval: (query) => code && Date.parse(code.expires_at) > Date.now() && !query.state.data?.discord_id ? 5000 : false });
  const generate = useMutation({ mutationFn: async () => {
    const { data, error } = await supabase.rpc('create_discord_link_code');
    if (error) throw error;
    setNow(Date.now());
    setCode(data as Code);
  } });
  const unlink = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc('unlink_my_discord');
    if (error) throw error;
  }, onSuccess: () => { setCode(null); void client.invalidateQueries({ queryKey: key }); } });
  const [openError, setOpenError] = useState(false);
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [code]);
  const remaining = code ? Math.max(0, Math.ceil((Date.parse(code.expires_at) - now) / 1000)) : 0;
  const formattedCode = code?.code.match(/.{1,8}/g)?.join('\n');
  const error = generate.error ?? unlink.error;
  const openDiscord = () => {
    setOpenError(false);
    void Linking.openURL('https://discord.com/channels/1570441175746347010').catch(() => setOpenError(true));
  };
  return (
    <Card style={styles.card}>
      <Text variant="label" style={{ color: colors.neon }}>KART RIVALS × DISCORD</Text>
      <Text variant="heading">Ta licence, aussi sur Discord</Text>
      {link.isPending ? <Text variant="caption">Vérification de la liaison…</Text> : link.isError ? (
        <>
          <Text variant="caption">La liaison Discord est momentanément indisponible.</Text>
          <Button title="Réessayer" variant="secondary" onPress={() => { void link.refetch(); }} />
        </>
      ) : link.data?.discord_id ? (
        <>
          <View style={styles.badge}><Text style={{ color: colors.neon }}>✓ Compte connecté</Text></View>
          <Text variant="caption" selectable>Compte Discord · {link.data.discord_id}</Text>
          <Button title="Ouvrir notre Discord" variant="secondary" onPress={openDiscord} />
          <Text variant="caption">Utilise /profil ou /mesrecords sans saisir ton pseudo. Ton réglage de visibilité reste appliqué.</Text>
          <Button title="Dissocier Discord" variant="ghost" loading={unlink.isPending}
            onPress={() => confirmAction('Dissocier Discord ?', 'Le bot ne retrouvera plus automatiquement ton profil.', 'Dissocier', () => unlink.mutate())} />
        </>
      ) : (
        <>
          <Text variant="caption">Retrouve tes statistiques et tes records sur Discord sans retaper ton pseudo.</Text>
          {code ? (
            <View style={styles.codeBox}>
              <Text variant="label" style={{ color: colors.neon }}>TON CODE DE LIAISON</Text>
              {remaining > 0 ? (
                <>
                  <Text selectable accessibilityLabel="Code de liaison, appui long pour copier" style={styles.code}>{formattedCode}</Text>
                  <Text variant="caption" style={styles.center}>Appui long sur le code → Tout sélectionner → Copier.</Text>
                  <View style={styles.badge}>
                    <Text style={{ color: colors.neon }}>Expire dans {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text>
                  </View>
                </>
              ) : <Text style={styles.center}>Ce code a expiré. Génère-en un nouveau.</Text>}
            </View>
          ) : null}
          <Text>1. Génère ton code privé.</Text>
          <Text>2. Sur notre Discord, utilise <Text style={{ color: colors.neon }}>/lier</Text> et colle le code.</Text>
          <Text variant="caption">Les retours à la ligne sont acceptés. Le code est à usage unique : garde-le pour toi.</Text>
          <Button title={code ? 'Nouveau code' : 'Générer mon code'} loading={generate.isPending} onPress={() => generate.mutate()} />
          <Button title="Ouvrir notre Discord" variant="secondary" onPress={openDiscord} />
          <Text variant="caption">Seules les données de ton profil public seront affichées par les commandes du bot.</Text>
        </>
      )}
      {openError ? <Text style={{ color: colors.danger }}>Ouvre Discord puis le serveur Kart Rivals pour utiliser /lier.</Text> : null}
      {error ? <Text style={{ color: colors.danger }}>{error.message}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderColor: colors.neon, borderTopWidth: 3 },
  codeBox: { backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.neon, padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 26, lineHeight: 38, letterSpacing: 2, textAlign: 'center', color: colors.text },
  badge: { alignSelf: 'center', backgroundColor: colors.neonDim, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8 },
  center: { textAlign: 'center' },
});
