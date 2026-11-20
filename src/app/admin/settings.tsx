import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import {
  APP_VERSION,
  isOutdated,
  isVersion,
  useAppSettings,
  useUpdateAppSettings,
  type AppSettings,
  type AppSettingsChanges,
} from '@/features/settings/app-settings';
import { SectionTitle } from '@/features/social/components/section-title';
import { confirmAction } from '@/lib/confirm';
import { dateTimeFormat } from '@/lib/format';
import { colors, spacing } from '@/theme';

/** Réglages de l'appli appliqués à distance : pause du Time Attack, maintenance, version minimale. */
export default function AdminSettingsScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const settings = useAppSettings();
  // Gardés ici : le formulaire est recréé après chaque enregistrement, la confirmation doit lui survivre.
  const update = useUpdateAppSettings();
  const [saved, setSaved] = useState<string | null>(null);
  const save = (changes: AppSettingsChanges, done: string) => {
    setSaved(null);
    update.mutate(changes, { onSuccess: () => setSaved(done) });
  };

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={settings.isRefetching} onRefresh={settings.refetch}>
      <Text variant="caption">
        Ces réglages s’appliquent sans mise à jour de l’appli : les pilotes les reçoivent en quelques minutes, ou dès
        qu’ils rouvrent l’appli. Chaque changement est noté au journal.
      </Text>
      {settings.isPending ? <Loading /> : null}
      {settings.error ? <ErrorState error={settings.error} /> : null}
      {update.error ? <Text style={styles.error}>{update.error.message}</Text> : null}
      {saved ? <Text style={styles.notice}>{saved}</Text> : null}
      {/* La clé remet les formulaires à zéro après un enregistrement, ou quand un autre admin a modifié les réglages. */}
      {settings.data ? (
        <SettingsForm key={settings.data.updated_at} settings={settings.data} saving={update.isPending} onSave={save} />
      ) : null}
    </Screen>
  );
}

function SettingsForm({ settings: s, saving, onSave: save }: { settings: AppSettings; saving: boolean; onSave: (changes: AppSettingsChanges, done: string) => void }) {
  const [taMessage, setTaMessage] = useState(s.time_attack_message ?? '');
  const [maintenanceMessage, setMaintenanceMessage] = useState(s.maintenance_message ?? '');
  const [minVersion, setMinVersion] = useState(s.min_version ?? '');
  const [iosUrl, setIosUrl] = useState(s.ios_store_url ?? '');
  const [androidUrl, setAndroidUrl] = useState(s.android_store_url ?? '');
  const version = minVersion.trim();
  const versionChanged =
    version !== (s.min_version ?? '') || iosUrl.trim() !== (s.ios_store_url ?? '') || androidUrl.trim() !== (s.android_store_url ?? '');
  // Une version minimale au-dessus de celle de l'admin bloquerait tous les pilotes qui ont la même appli que lui.
  const blocksCurrent = isVersion(version) && isOutdated(version);

  return (
    <>
      <SectionTitle title="Time Attack" accent={s.time_attack_enabled ? colors.neon : colors.orange} />
      <Card style={styles.card}>
        <Toggle
          label={s.time_attack_enabled ? 'Ouvert' : 'En pause'}
          detail={
            s.time_attack_enabled
              ? 'Les pilotes peuvent faire un check-in et envoyer leur ticket.'
              : 'Plus aucun check-in n’est accepté. Les sessions déjà en cours se terminent normalement.'
          }
          value={s.time_attack_enabled}
          disabled={saving}
          onChange={(open) =>
            open
              ? save({ time_attack_enabled: true }, 'Time Attack rouvert ✓')
              : confirmAction(
                  'Mettre le Time Attack en pause ?',
                  'À utiliser quand la lecture des tickets ne fonctionne plus. Le mode disparaît des menus et les check-in sont refusés jusqu’à la reprise.',
                  'Mettre en pause',
                  () => save({ time_attack_enabled: false, time_attack_message: taMessage }, 'Time Attack en pause ✓'),
                )
          }
        />
        <Input
          label={`Message pendant la pause (${taMessage.length}/200)`}
          value={taMessage}
          onChangeText={setTaMessage}
          placeholder="La lecture des tickets est en panne, retour prévu demain matin."
          multiline
          maxLength={200}
          style={styles.multiline}
        />
        <Button
          title="Enregistrer le message"
          variant="secondary"
          disabled={taMessage.trim() === (s.time_attack_message ?? '')}
          loading={saving}
          onPress={() => save({ time_attack_message: taMessage }, 'Message enregistré ✓')}
        />
      </Card>

      <SectionTitle title="Maintenance" accent={s.maintenance ? colors.danger : colors.neon} />
      <Card style={[styles.card, s.maintenance && styles.danger]}>
        <Toggle
          label={s.maintenance ? 'Appli en maintenance' : 'Appli ouverte'}
          detail={
            s.maintenance
              ? 'Les pilotes connectés voient un écran d’attente. Toi et les autres admins appli gardez l’accès.'
              : 'À activer pendant une opération sur la base ou un incident. Les admins appli gardent l’accès.'
          }
          value={s.maintenance}
          danger
          disabled={saving}
          onChange={(on) =>
            on
              ? confirmAction(
                  'Passer l’appli en maintenance ?',
                  'Tous les pilotes connectés sont bloqués sur un écran d’attente jusqu’à ce que tu la désactives ici.',
                  'Activer la maintenance',
                  () => save({ maintenance: true, maintenance_message: maintenanceMessage }, 'Maintenance activée ✓'),
                )
              : save({ maintenance: false }, 'Maintenance terminée ✓')
          }
        />
        <Input
          label={`Message affiché (${maintenanceMessage.length}/300)`}
          value={maintenanceMessage}
          onChangeText={setMaintenanceMessage}
          placeholder="Kart Rivals est en maintenance jusqu’à 14 h."
          multiline
          maxLength={300}
          style={styles.multiline}
        />
        <Button
          title="Enregistrer le message"
          variant="secondary"
          disabled={maintenanceMessage.trim() === (s.maintenance_message ?? '')}
          loading={saving}
          onPress={() => save({ maintenance_message: maintenanceMessage }, 'Message enregistré ✓')}
        />
      </Card>

      <SectionTitle title="Version minimale" />
      <Card style={styles.card}>
        <Text variant="caption">
          En dessous de cette version, l’appli demande la mise à jour depuis la boutique et rien d’autre n’est accessible.
          Laisse vide pour accepter toutes les versions. Ta version : {APP_VERSION}.
        </Text>
        <Input
          label="Version minimale"
          value={minVersion}
          onChangeText={setMinVersion}
          placeholder="1.2.0"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={12}
        />
        {blocksCurrent ? (
          <Text style={styles.warn}>
            {version} est au-dessus de la version {APP_VERSION} que tu utilises : tous les pilotes sur cette version seront
            bloqués tant qu’ils n’ont pas mis à jour.
          </Text>
        ) : null}
        <Input label="Lien App Store" value={iosUrl} onChangeText={setIosUrl} placeholder="https://apps.apple.com/app/…" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
        <Input label="Lien Google Play" value={androidUrl} onChangeText={setAndroidUrl} placeholder="https://play.google.com/store/apps/details?id=…" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
        <Text variant="caption">Sans lien, l’écran de mise à jour demande au pilote de chercher « Kart Rivals » dans sa boutique.</Text>
        <Button
          title="Enregistrer"
          variant="secondary"
          disabled={!versionChanged}
          loading={saving}
          onPress={() => {
            const changes = { min_version: version, ios_store_url: iosUrl, android_store_url: androidUrl };
            if (blocksCurrent && version !== (s.min_version ?? '')) {
              confirmAction(
                `Exiger la version ${version} ?`,
                `Les pilotes en version ${APP_VERSION} ou plus ancienne ne pourront plus utiliser l’appli avant de l’avoir mise à jour. Vérifie que la version ${version} est bien disponible dans les boutiques.`,
                'Exiger cette version',
                () => save(changes, 'Version minimale enregistrée ✓'),
              );
            } else {
              save(changes, 'Version minimale enregistrée ✓');
            }
          }}
        />
      </Card>

      <Text variant="caption">Dernière modification : {dateTimeFormat.format(new Date(s.updated_at))}</Text>
    </>
  );
}

function Toggle({ label, detail, value, danger, disabled, onChange }: { label: string; detail: string; value: boolean; danger?: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <Text style={styles.bold}>{label}</Text>
        <Text variant="caption">{detail}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: danger ? colors.danger : colors.neon, false: colors.surfaceAlt }}
        thumbColor={colors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  card: { gap: spacing.md },
  danger: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  multiline: { minHeight: 80, paddingTop: 14, textAlignVertical: 'top' },
  error: { color: colors.danger },
  notice: { color: colors.neon, fontWeight: '700' },
  warn: { fontSize: 13, fontWeight: '700', color: colors.orange },
});
