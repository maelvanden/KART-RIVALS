const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « Aujourd'hui · 20:00 », « Demain · 14:00 », « samedi 25 oct. · 14:00 ». */
export function sessionWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const label =
    d.toDateString() === today.toDateString() ? 'Aujourd’hui' : d.toDateString() === tomorrow.toDateString() ? 'Demain' : day.format(d);
  return `${label} · ${time.format(d)}`;
}
