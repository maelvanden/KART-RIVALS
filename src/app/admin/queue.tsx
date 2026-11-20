import { useState } from 'react';

import { Chips } from '@/components/ui/chips';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { isStaff, useAdminRoles } from '@/features/admin/api';
import { QueueRow } from '@/features/admin/components/queue-row';
import { QUEUE_LABELS, useAdminQueue, type QueueKind } from '@/features/admin/queue';

/** File « À traiter » : tout ce qui attend un admin, du plus ancien au plus récent. */
export default function AdminQueueScreen() {
  const roles = useAdminRoles().data;
  const isAppAdmin = isStaff(roles);
  const queue = useAdminQueue(isAppAdmin, roles?.is_app_admin ? 'admin' : 'moderator');
  const [kind, setKind] = useState<QueueKind | null>(null);

  if (!isAppAdmin) return <Screen safeTop={false}><EmptyState title="Réservé à l’équipe Kart Rivals" /></Screen>;

  const count = (k: QueueKind) => queue.items.filter((i) => i.kind === k).length;
  const kinds = (Object.keys(QUEUE_LABELS) as QueueKind[]).filter((k) => count(k) > 0);
  const shown = kind ? queue.items.filter((i) => i.kind === kind) : queue.items;

  return (
    <Screen safeTop={false} refreshing={queue.isRefetching} onRefresh={queue.refetch}>
      <Text variant="caption">Le plus ancien en premier. Touche un élément pour le traiter dans son écran.</Text>
      {kinds.length > 1 ? (
        <Chips
          options={[
            { value: null as QueueKind | null, label: `Tout · ${queue.items.length}` },
            ...kinds.map((k) => ({ value: k as QueueKind | null, label: `${QUEUE_LABELS[k]} · ${count(k)}` })),
          ]}
          value={kind}
          onChange={setKind}
        />
      ) : null}
      {queue.isPending ? <Loading /> : null}
      {queue.error ? <ErrorState error={queue.error} /> : null}
      {!queue.isPending && shown.length === 0 ? (
        <EmptyState title="Rien à traiter 🏁" message="Signalements, tickets, litiges, remontées et demandes : tout est à jour." />
      ) : null}
      {shown.map((item) => (
        <QueueRow key={item.key} item={item} />
      ))}
    </Screen>
  );
}
