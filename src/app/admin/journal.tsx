import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { useAdminRoles } from '@/features/admin/api';
import { ActionLine } from '@/features/admin/components/action-line';
import { useAdminRecentActions } from '@/features/admin/panel';

/** Journal : les 100 dernières actions des admins appli. */
export default function AdminJournalScreen() {
  const isAppAdmin = !!useAdminRoles().data?.is_app_admin;
  const actions = useAdminRecentActions(isAppAdmin, 100);
  return (
    <Screen safeTop={false} refreshing={actions.isRefetching} onRefresh={actions.refetch}>
      {actions.isPending ? <Loading /> : null}
      {actions.error ? <ErrorState error={actions.error} /> : null}
      {actions.data?.length === 0 ? <EmptyState title="Aucune action pour l’instant" /> : null}
      {actions.data?.map((a) => <ActionLine key={a.id} action={a} />)}
    </Screen>
  );
}
