/** Créneaux proposés pour fixer une course (jours à venir + heures rondes). */
export const HOURS = [10, 14, 17, 19, 21];

const dayLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });

export function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const label = i === 0 ? 'Aujourd’hui' : i === 1 ? 'Demain' : dayLabel.format(d);
    return { value: d.getTime(), label };
  });
}

/** Jour (minuit, en ms) + heure → date ISO ; null si « à définir ». */
export const toScheduledAt = (day: number | null, hour: number) =>
  day === null ? null : new Date(day + hour * 3_600_000).toISOString();
