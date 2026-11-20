import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { MAX_APPEAL, MIN_APPEAL, useMyAppeal, useSubmitAppeal } from '@/features/admin/appeals';
import type { AccountStatus } from '@/features/admin/panel';
import { CONTACT_EMAIL, emailTeam } from '@/lib/legal';
import { colors, spacing } from '@/theme';

/** Écran affiché à l'ouverture de l'appli quand le compte est suspendu ou banni. */
export function RestrictedAccount({ status, onSignOut, onRetry }: { status: AccountStatus; onSignOut: () => void; onRetry: () => void }) {
  const banned = !!status.banned_at;
  const until = status.suspended_until
    ? new Date(status.suspended_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const appeal = useMyAppeal(true);
  const mine = appeal.data;
  const lastStatus = useRef(mine?.status);

  // Recours accepté : la sanction est levée côté serveur, le recours disparaît. On relit alors le statut du compte
  // pour sortir de cet écran sans attendre.
  useEffect(() => {
    if (lastStatus.current === 'open' && mine === null) onRetry();
    lastStatus.current = mine?.status;
  }, [mine, onRetry]);

  return (
    <View style={styles.screen}>
      <Icon name={icons.block} size={44} color={banned ? colors.danger : colors.orange} />
      <Text variant="display" style={styles.center}>
        {banned ? 'Compte banni' : 'Compte suspendu'}
      </Text>
      <Text style={styles.center}>
        {banned
          ? 'Ton compte a été bloqué par l’équipe Kart Rivals.'
          : `Ton compte est suspendu jusqu’au ${until}. Tu retrouveras l’appli ensuite.`}
      </Text>
      {status.reason ? <Text variant="caption" style={styles.center}>Motif : {status.reason}</Text> : null}

      {appeal.isSuccess ? <Appeal appeal={mine ?? null} /> : null}

      <Text variant="caption" style={styles.center}>
        Une autre question ? Écris à l’équipe : {CONTACT_EMAIL}
      </Text>
      <Button
        title="Écrire à l’équipe"
        variant="secondary"
        onPress={() => emailTeam(banned ? 'Contestation de bannissement' : 'Contestation de suspension')}
      />
      {!banned || mine ? <Button title="Vérifier à nouveau" variant="secondary" onPress={onRetry} /> : null}
      <Button title="Se déconnecter" variant="quiet" onPress={onSignOut} />
    </View>
  );
}

/** Contester la sanction : formulaire, puis suivi de la réponse d'un admin. Un seul recours par sanction. */
function Appeal({ appeal }: { appeal: ReturnType<typeof useMyAppeal>['data'] }) {
  const submit = useSubmitAppeal();
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState('');

  if (appeal) {
    const rejected = appeal.status === 'rejected';
    return (
      <Card style={[styles.card, rejected && styles.rejected]}>
        <Text variant="label" style={{ color: rejected ? colors.danger : colors.neon }}>
          {rejected ? 'Recours refusé' : 'Recours envoyé'}
        </Text>
        <Text variant="caption">
          {rejected
            ? 'Un admin a examiné ton recours : la sanction est maintenue.'
            : `Envoyé le ${new Date(appeal.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}. Un admin l’examine et te répond ici.`}
        </Text>
        {rejected && appeal.response ? <Text>« {appeal.response} »</Text> : null}
        <Text variant="caption">Ton message : « {appeal.message} »</Text>
      </Card>
    );
  }

  if (!writing) return <Button title="Contester la sanction" onPress={() => setWriting(true)} />;

  return (
    <Card style={styles.card}>
      <Text variant="label">Contester la sanction</Text>
      <Text variant="caption">
        Explique ce qui s’est passé. Un admin lit ton message et te répond sur cet écran. Tu ne peux envoyer qu’un seul
        recours par sanction.
      </Text>
      <Input
        label={`Ton message (${message.trim().length}/${MAX_APPEAL})`}
        value={message}
        onChangeText={setMessage}
        placeholder="Ce qui s’est passé, et pourquoi la sanction te paraît injustifiée"
        multiline
        maxLength={MAX_APPEAL}
        style={styles.multiline}
      />
      {submit.error ? <Text style={styles.error}>{submit.error.message}</Text> : null}
      <Button title="Envoyer le recours" loading={submit.isPending} disabled={message.trim().length < MIN_APPEAL} onPress={() => submit.mutate(message)} />
      <Button title="Annuler" variant="quiet" onPress={() => setWriting(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: 32, backgroundColor: colors.background },
  center: { textAlign: 'center' },
  card: { gap: spacing.sm, alignSelf: 'stretch' },
  rejected: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  multiline: { minHeight: 100, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
});
