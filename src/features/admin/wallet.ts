import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { GearItem, GearRarity, GearSlot } from '@/features/garage/catalog';
import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoGarageFor, demoGearCatalog, demoProfile, demoWallet, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier } from '@/types/models';

export type PointReason =
  | 'welcome'
  | 'match'
  | 'race'
  | 'time_attack'
  | 'purchase'
  | 'admin_adjustment'
  | 'mission'
  | 'contribution'
  | 'tournament';

export type WalletTransaction = {
  id: number;
  amount: number;
  reason: PointReason;
  /** Motif saisi par l'admin (ajustements). */
  note: string | null;
  /** Nom de l'objet acheté. */
  item: string | null;
  created_at: string;
};

export type WalletItem = {
  id: string;
  name: string;
  slot: GearSlot;
  rarity: GearRarity;
  price: number;
  acquired_at: string;
  worn: boolean;
};

export type PilotWallet = {
  id: string;
  username: string;
  points: number;
  rank: RankTier;
  earned_30d: number;
  spent_30d: number;
  transactions: WalletTransaction[];
  items: WalletItem[];
};

export type CatalogRow = GearItem & { owners: number; bought_30d: number };

export const POINT_REASONS: Record<PointReason, string> = {
  welcome: 'Bienvenue',
  match: 'Défi validé',
  race: 'Course validée',
  time_attack: 'Time Attack validé',
  purchase: 'Achat en boutique',
  admin_adjustment: 'Ajustement par un admin',
  mission: 'Mission de la semaine',
  contribution: 'Remontée appliquée',
  tournament: 'Podium de tournoi',
};

/** Plafond d'un ajustement, comme côté base (admin_adjust_points). */
export const MAX_ADJUSTMENT = 5000;

// ---------- Mode démo ----------

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const demoBalances: Record<string, number> = { p1: 820, p2: 310, p3: 1240, p4: 60 };
const demoTransactions: Record<string, WalletTransaction[]> = {};
let demoId = 1000;

const demoUsername = (id: string) =>
  id === demoProfile.id ? demoProfile.username : (Object.values(demoPilots).find((p) => p.id === id)?.username ?? 'Pilote');
const demoRank = (id: string): RankTier =>
  id === demoProfile.id ? demoProfile.rank : (Object.values(demoPilots).find((p) => p.id === id)?.rank ?? 'novice');
const demoPoints = (id: string) => (id === demoProfile.id ? demoWallet.points : (demoBalances[id] ?? 0));
const setDemoPoints = (id: string, points: number) => {
  if (id === demoProfile.id) demoWallet.points = points;
  else demoBalances[id] = points;
};
const demoHistory = (id: string) =>
  (demoTransactions[id] ??= [
    { id: demoId++, amount: 50, reason: 'match', note: null, item: null, created_at: ago(2) },
    { id: demoId++, amount: -150, reason: 'purchase', note: null, item: 'Casque Street', created_at: ago(9) },
    { id: demoId++, amount: 30, reason: 'time_attack', note: null, item: null, created_at: ago(12) },
    { id: demoId++, amount: 200, reason: 'welcome', note: null, item: null, created_at: ago(40) },
  ]);
const demoItem = (id: string) => {
  const item = demoGearCatalog.find((i) => i.id === id);
  if (!item) throw new Error('ITEM_NOT_FOUND');
  return item;
};

// ---------- Hooks ----------

const messages: Record<string, string> = {
  'Pilot not found': 'Pilote introuvable.',
  'Invalid points amount': `Montant invalide : entre 1 et ${MAX_ADJUSTMENT} points.`,
  'A reason is required': 'Indique le motif (3 caractères minimum) : le pilote le reçoit.',
  'Pilot has no points to remove': 'Ce pilote n’a plus de points à retirer.',
  ITEM_NOT_FOUND: 'Cet objet n’existe plus dans la boutique.',
  ALREADY_OWNED: 'Ce pilote possède déjà cet objet.',
  NOT_OWNED: 'Ce pilote ne possède pas cet objet.',
  'This item is not for sale': 'Cet objet n’est pas en vente : il se gagne avec un rang.',
  'Invalid price': 'Prix invalide : entre 1 et 100 000 points.',
};

function walletError(error: { message: string }): Error {
  const known = Object.entries(messages).find(([code]) => error.message.includes(code));
  return known ? new Error(known[1]) : socialError(error);
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw walletError(error);
  return data as T;
}

export function usePilotWallet(pilotId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-wallet', pilotId],
    enabled: !!pilotId && enabled,
    queryFn: async (): Promise<PilotWallet> => {
      if (isDemoMode) {
        const garage = demoGarageFor(pilotId!);
        const transactions = [...demoHistory(pilotId!)];
        const recent = transactions.filter((t) => Date.now() - Date.parse(t.created_at) < 30 * 86_400_000);
        return {
          id: pilotId!,
          username: demoUsername(pilotId!),
          points: demoPoints(pilotId!),
          rank: demoRank(pilotId!),
          earned_30d: recent.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
          spent_30d: -recent.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0),
          transactions,
          items: garage.owned.map((id, i) => {
            const item = demoItem(id);
            return { id, name: item.name, slot: item.slot, rarity: item.rarity, price: item.price, acquired_at: ago(5 + i * 6), worn: garage.equipped[item.slot] === id };
          }),
        };
      }
      return rpc<PilotWallet>('admin_pilot_wallet', { p_profile: pilotId });
    },
  });
}

function useInvalidateWallet() {
  const queryClient = useQueryClient();
  return () =>
    ['admin-wallet', 'admin-actions', 'admin-pilot', 'admin-gear-catalog', 'garage', 'my-points', 'profile'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
}

/** Crédit (montant positif) ou retrait (négatif) de points, avec un motif envoyé au pilote. */
export function useAdjustPoints() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: async ({ pilotId, amount, reason }: { pilotId: string; amount: number; reason: string }) => {
      if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUSTMENT) throw new Error(messages['Invalid points amount']);
      if (reason.trim().length < 3) throw new Error(messages['A reason is required']);
      if (isDemoMode) {
        const before = demoPoints(pilotId);
        const applied = Math.max(amount, -before);
        if (applied === 0) throw new Error(messages['Pilot has no points to remove']);
        setDemoPoints(pilotId, before + applied);
        demoHistory(pilotId).unshift({ id: demoId++, amount: applied, reason: 'admin_adjustment', note: reason.trim(), item: null, created_at: new Date().toISOString() });
        return;
      }
      await rpc('admin_adjust_points', { p_profile: pilotId, p_amount: amount, p_reason: reason.trim() });
    },
    onSuccess: invalidate,
  });
}

export function useGrantItem() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: async ({ pilotId, itemId, reason }: { pilotId: string; itemId: string; reason?: string }) => {
      if (isDemoMode) {
        const item = demoItem(itemId);
        const garage = demoGarageFor(pilotId);
        if (item.rarity === 'starter' || garage.owned.includes(itemId)) throw new Error(messages.ALREADY_OWNED);
        garage.owned.unshift(itemId);
        return;
      }
      await rpc('admin_grant_item', { p_profile: pilotId, p_item_id: itemId, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useRevokeItem() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: async ({ pilotId, itemId, reason }: { pilotId: string; itemId: string; reason?: string }) => {
      if (isDemoMode) {
        const item = demoItem(itemId);
        const garage = demoGarageFor(pilotId);
        if (!garage.owned.includes(itemId)) throw new Error(messages.NOT_OWNED);
        garage.owned = garage.owned.filter((id) => id !== itemId);
        if (garage.equipped[item.slot] === itemId) delete garage.equipped[item.slot];
        return;
      }
      await rpc('admin_revoke_item', { p_profile: pilotId, p_item_id: itemId, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

/** Catalogue de la boutique avec le nombre de propriétaires et les ventes du mois. */
export function useAdminGearCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-gear-catalog'],
    enabled,
    queryFn: async (): Promise<CatalogRow[]> => {
      if (isDemoMode) {
        return demoGearCatalog.map((item, i) => ({
          ...item,
          owners: item.rarity === 'starter' ? 0 : Math.max(1, 240 - item.price / 5 - i * 3) | 0,
          bought_30d: item.price > 0 ? Math.max(0, 40 - Math.round(item.price / 30)) : 0,
        }));
      }
      return rpc<CatalogRow[]>('admin_gear_catalog');
    },
  });
}

export function useSetGearPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, price }: { itemId: string; price: number }) => {
      if (!Number.isInteger(price) || price < 1 || price > 100_000) throw new Error(messages['Invalid price']);
      if (isDemoMode) {
        const item = demoItem(itemId);
        if (item.price === 0) throw new Error(messages['This item is not for sale']);
        item.price = price;
        return;
      }
      await rpc('admin_set_gear_price', { p_item_id: itemId, p_price: price });
    },
    onSuccess: () =>
      ['admin-gear-catalog', 'gear-catalog', 'admin-actions'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  });
}
