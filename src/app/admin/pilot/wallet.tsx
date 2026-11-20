import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import {
  MAX_ADJUSTMENT,
  POINT_REASONS,
  useAdjustPoints,
  useGrantItem,
  usePilotWallet,
  useRevokeItem,
  type PilotWallet,
  type WalletTransaction,
} from '@/features/admin/wallet';
import { useGearCatalog } from '@/features/garage/api';
import { gearSlots, rarityMeta, slotLabels, type GearItem, type GearSlot } from '@/features/garage/catalog';
import { GearArt } from '@/features/garage/components/gear-art';
import { SectionTitle } from '@/features/social/components/section-title';
import { confirmAction } from '@/lib/confirm';
import { formatMessageTime } from '@/lib/format';
import { colors, rankMeta, spacing } from '@/theme';

const QUICK = [50, 100, 200, 500];
const pts = (n: number) => `${n.toLocaleString('fr-FR')} pt${Math.abs(n) > 1 ? 's' : ''}`;

/** Points et garage d'un pilote, côté admin appli : ajuster le solde, offrir ou retirer un objet, lire le journal. */
export default function AdminWalletScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const wallet = usePilotWallet(id, isAppAdmin);
  const w = wallet.data;

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  return (
    <Screen safeTop={false} refreshing={wallet.isRefetching} onRefresh={wallet.refetch}>
      <Stack.Screen options={{ title: w ? `Points · ${w.username}` : 'Points et garage' }} />
      {wallet.isPending ? <Loading /> : null}
      {wallet.error ? <ErrorState error={wallet.error} /> : null}
      {w ? <Wallet wallet={w} /> : null}
    </Screen>
  );
}

function Wallet({ wallet: w }: { wallet: PilotWallet }) {
  const catalog = useGearCatalog();
  const adjust = useAdjustPoints();
  const grant = useGrantItem();
  const revoke = useRevokeItem();
  const [mode, setMode] = useState<'credit' | 'debit'>('credit');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState<GearSlot>('helmet');
  const [notice, setNotice] = useState<string | null>(null);

  const amount = Number.parseInt(amountInput, 10) || 0;
  const error = [adjust, grant, revoke].find((m) => m.error)?.error;
  const busy = adjust.isPending || grant.isPending || revoke.isPending;
  const hasReason = reason.trim().length >= 3;
  const sent = hasReason ? `Motif envoyé au pilote : « ${reason.trim()} »` : 'Aucun motif indiqué.';
  const owned = new Set(w.items.map((i) => i.id));
  const offers = (catalog.data ?? []).filter((i) => i.slot === slot && i.rarity !== 'starter' && !owned.has(i.id));
  // Un retrait est plafonné au solde : le pilote ne passe jamais en négatif.
  const applied = mode === 'credit' ? amount : -Math.min(amount, w.points);
  const done = (text: string) => () => setNotice(text);

  return (
    <>
      <Card style={styles.balance}>
        <Text variant="label">Solde de {w.username}</Text>
        <Text style={styles.points}>{w.points.toLocaleString('fr-FR')} pts</Text>
        <Text variant="caption">
          Rang {rankMeta[w.rank].label} · 30 derniers jours : +{w.earned_30d.toLocaleString('fr-FR')} gagnés,{' '}
          {w.spent_30d.toLocaleString('fr-FR')} dépensés ou retirés
        </Text>
      </Card>

      <Input
        label="Motif"
        value={reason}
        onChangeText={(v) => {
          setNotice(null);
          setReason(v);
        }}
        placeholder="Lot du tournoi, geste commercial, points gagnés en trichant…"
        maxLength={140}
      />
      <Text variant="caption">Le pilote reçoit ce motif en notification. Obligatoire pour toucher aux points.</Text>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <SectionTitle title="Ajuster les points" />
      <Segmented
        options={[
          { value: 'credit', label: 'Créditer' },
          { value: 'debit', label: 'Retirer' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Chips options={QUICK.map((n) => ({ value: String(n), label: `${n} pts` }))} value={amountInput} onChange={setAmountInput} />
      <Input
        label={`Montant (${MAX_ADJUSTMENT.toLocaleString('fr-FR')} maximum)`}
        value={amountInput}
        onChangeText={(v) => setAmountInput(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="200"
      />
      {mode === 'debit' && amount > w.points ? (
        <Text variant="caption">Le solde est de {pts(w.points)} : le retrait sera limité à ce montant.</Text>
      ) : null}
      <Button
        title={amount > 0 ? `${mode === 'credit' ? 'Créditer' : 'Retirer'} ${pts(Math.abs(applied))}` : mode === 'credit' ? 'Créditer' : 'Retirer'}
        disabled={amount <= 0 || amount > MAX_ADJUSTMENT || applied === 0 || !hasReason || busy}
        loading={adjust.isPending}
        onPress={() =>
          confirmAction(
            `${mode === 'credit' ? 'Créditer' : 'Retirer'} ${pts(Math.abs(applied))} ?`,
            `Nouveau solde de ${w.username} : ${pts(w.points + applied)}. ${sent}`,
            mode === 'credit' ? 'Créditer' : 'Retirer',
            () =>
              adjust.mutate(
                { pilotId: w.id, amount: applied, reason },
                {
                  onSuccess: () => {
                    setAmountInput('');
                    setNotice(`${applied > 0 ? '+' : '−'}${pts(Math.abs(applied))} ✓`);
                  },
                },
              ),
          )
        }
      />

      <SectionTitle title="Offrir un objet" />
      <Chips options={gearSlots.map((s) => ({ value: s.slot, label: s.label }))} value={slot} onChange={setSlot} />
      {catalog.isPending ? <Loading /> : null}
      {catalog.data && offers.length === 0 ? (
        <Text variant="caption">{w.username} possède déjà tous les objets de cette catégorie.</Text>
      ) : null}
      {offers.map((item) => (
        <ItemLine
          key={item.id}
          item={item}
          detail={item.price > 0 ? `En vente à ${pts(item.price)}` : item.unlock_rank ? `Récompense du rang ${rankMeta[item.unlock_rank].label}` : ''}
          action="Offrir"
          disabled={busy}
          onPress={() =>
            confirmAction(`Offrir « ${item.name} » ?`, `L’objet rejoint le garage de ${w.username}, sans débit de points. ${sent}`, 'Offrir', () =>
              grant.mutate({ pilotId: w.id, itemId: item.id, reason }, { onSuccess: done(`« ${item.name} » offert ✓`) }),
            )
          }
        />
      ))}

      <SectionTitle title="Sa collection" detail={`${w.items.length}`} />
      {w.items.length === 0 ? <Text variant="caption">Aucun objet : {w.username} roule en équipement de location.</Text> : null}
      {w.items.map((item) => (
        <ItemLine
          key={item.id}
          item={{ ...item, unlock_rank: null, sort: 0 }}
          detail={`${slotLabels[item.slot]} · obtenu le ${new Date(item.acquired_at).toLocaleDateString('fr-FR')}${item.worn ? ' · porté' : ''}`}
          action="Retirer"
          quiet
          disabled={busy}
          onPress={() =>
            confirmAction(
              `Retirer « ${item.name} » ?`,
              `L’objet quitte le garage de ${w.username}, sans remboursement${item.worn ? ', et il repasse en équipement de location' : ''}. ${sent}`,
              'Retirer',
              () => revoke.mutate({ pilotId: w.id, itemId: item.id, reason }, { onSuccess: done(`« ${item.name} » retiré ✓`) }),
            )
          }
        />
      ))}

      <SectionTitle title="Journal de points" detail={w.transactions.length === 60 ? '60 derniers' : `${w.transactions.length}`} />
      {w.transactions.length === 0 ? <Text variant="caption">Aucun mouvement.</Text> : null}
      {w.transactions.length > 0 ? (
        <Card style={styles.card}>
          {w.transactions.map((t) => (
            <Transaction key={t.id} transaction={t} />
          ))}
        </Card>
      ) : null}
    </>
  );
}

function ItemLine({ item, detail, action, quiet, disabled, onPress }: { item: GearItem; detail: string; action: string; quiet?: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <View style={styles.item}>
      <GearArt item={item} size={44} />
      <View style={styles.flex}>
        <Text style={styles.bold} numberOfLines={1}>{item.name}</Text>
        <Text variant="caption" numberOfLines={1}>
          <Text style={{ color: rarityMeta[item.rarity].color }}>{rarityMeta[item.rarity].label}</Text>
          {detail ? ` · ${detail}` : ''}
        </Text>
      </View>
      <Button title={action} variant={quiet ? 'quiet' : 'secondary'} disabled={disabled} onPress={onPress} />
    </View>
  );
}

function Transaction({ transaction: t }: { transaction: WalletTransaction }) {
  return (
    <View style={styles.transaction}>
      <View style={styles.flex}>
        <Text style={styles.bold}>
          {POINT_REASONS[t.reason] ?? t.reason}
          {t.item ? ` : ${t.item}` : ''}
        </Text>
        {t.note ? <Text variant="caption">« {t.note} »</Text> : null}
        <Text variant="caption">{formatMessageTime(t.created_at)}</Text>
      </View>
      <Text style={[styles.amount, t.amount < 0 && styles.negative]}>
        {t.amount > 0 ? '+' : '−'}
        {Math.abs(t.amount).toLocaleString('fr-FR')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  card: { gap: spacing.sm },
  balance: { gap: 2 },
  points: { fontSize: 34, fontWeight: '900', color: colors.neon },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  amount: { fontSize: 16, fontWeight: '900', color: colors.neon },
  negative: { color: colors.orange },
  error: { color: colors.danger },
  notice: { color: colors.neon, fontWeight: '700' },
});
