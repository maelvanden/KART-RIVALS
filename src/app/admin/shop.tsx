import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useAdminRoles } from '@/features/admin/api';
import { useAdminGearCatalog, useSetGearPrice, type CatalogRow } from '@/features/admin/wallet';
import { gearSlots, rarityMeta, type GearSlot } from '@/features/garage/catalog';
import { GearArt } from '@/features/garage/components/gear-art';
import { confirmAction } from '@/lib/confirm';
import { colors, radius, rankMeta, spacing } from '@/theme';

/** Boutique : catalogue, popularité de chaque objet et prix des objets en vente. */
export default function AdminShopScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const catalog = useAdminGearCatalog(isAppAdmin);
  const setPrice = useSetGearPrice();
  const [slot, setSlot] = useState<GearSlot>('helmet');
  const [editing, setEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé aux admins appli" /></Screen>;

  const items = (catalog.data ?? []).filter((i) => i.slot === slot);
  const sold = (catalog.data ?? []).reduce((sum, i) => sum + i.bought_30d, 0);

  function edit(item: CatalogRow) {
    setPrice.reset();
    setEditing(editing === item.id ? null : item.id);
    setPriceInput(String(item.price));
  }

  return (
    <Screen safeTop={false} refreshing={catalog.isRefetching} onRefresh={catalog.refetch}>
      <Text variant="caption">
        {catalog.data ? `${catalog.data.length} objets · ${sold} achat${sold > 1 ? 's' : ''} ces 30 derniers jours. ` : ''}
        Touche un objet en vente pour changer son prix : le nouveau prix s’applique aussitôt dans la boutique. Les visuels
        étant embarqués dans l’appli, l’ajout d’un objet passe toujours par une mise à jour.
      </Text>
      <Chips options={gearSlots.map((s) => ({ value: s.slot, label: s.label }))} value={slot} onChange={setSlot} />
      {catalog.isPending ? <Loading /> : null}
      {catalog.error ? <ErrorState error={catalog.error} /> : null}
      {items.map((item) => {
        const forSale = item.price > 0;
        const price = Number.parseInt(priceInput, 10) || 0;
        return (
          <View key={item.id} style={styles.row}>
            <Pressable
              accessibilityRole="button"
              disabled={!forSale}
              onPress={() => edit(item)}
              style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
              <GearArt item={item} size={48} />
              <View style={styles.flex}>
                <Text style={styles.bold} numberOfLines={1}>{item.name}</Text>
                <Text variant="caption" numberOfLines={1}>
                  <Text style={{ color: rarityMeta[item.rarity].color }}>{rarityMeta[item.rarity].label}</Text>
                  {item.rarity === 'starter'
                    ? ' · porté par défaut'
                    : ` · ${item.owners} propriétaire${item.owners > 1 ? 's' : ''}${forSale ? ` · ${item.bought_30d} achat${item.bought_30d > 1 ? 's' : ''} ce mois-ci` : ''}`}
                </Text>
              </View>
              <Text style={[styles.price, !forSale && styles.muted]}>
                {forSale
                  ? `${item.price.toLocaleString('fr-FR')} pts`
                  : item.unlock_rank
                    ? `Rang ${rankMeta[item.unlock_rank].label}`
                    : 'Gratuit'}
              </Text>
            </Pressable>
            {editing === item.id ? (
              <View style={styles.edit}>
                <View style={styles.flex}>
                  <Input label="Nouveau prix (points)" value={priceInput} onChangeText={(v) => setPriceInput(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} />
                </View>
                <Button
                  title="Enregistrer"
                  variant="secondary"
                  disabled={price < 1 || price === item.price}
                  loading={setPrice.isPending}
                  onPress={() =>
                    confirmAction(
                      `Passer « ${item.name} » à ${price.toLocaleString('fr-FR')} pts ?`,
                      `Prix actuel : ${item.price.toLocaleString('fr-FR')} pts. Les pilotes qui le possèdent déjà ne sont ni remboursés ni débités.`,
                      'Changer le prix',
                      () => setPrice.mutate({ itemId: item.id, price }, { onSuccess: () => setEditing(null) }),
                    )
                  }
                />
              </View>
            ) : null}
            {editing === item.id && setPrice.error ? <Text style={styles.error}>{setPrice.error.message}</Text> : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  edit: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  pressed: { opacity: 0.8 },
  price: { fontWeight: '900', color: colors.neon },
  muted: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  error: { color: colors.danger },
});
