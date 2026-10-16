/**
 * Какую группу занятий показать малышу. Группы Виктории идут не встык
 * (нет 14–17 месяцев, нет младше месяца и старше двух лет), поэтому, если
 * точной нет, берём ближайшую по возрасту, при равенстве — младшую: её
 * занятия малыш уже точно потянет. Экран показывает её молча, как свою:
 * так попросили — без пометок «отдельного списка нет».
 */
export interface AgeRange {
  ageMonthsFrom: number;
  /** Не включая. */
  ageMonthsTo: number;
}

export function pickGroup<T extends AgeRange>(groups: T[], months: number): { group: T; exact: boolean } | null {
  if (groups.length === 0) return null;
  const distance = (group: T) =>
    months < group.ageMonthsFrom ? group.ageMonthsFrom - months : months >= group.ageMonthsTo ? months - group.ageMonthsTo + 1 : 0;
  const sorted = [...groups].sort((a, b) => a.ageMonthsFrom - b.ageMonthsFrom);
  let best = sorted[0];
  for (const group of sorted) if (distance(group) < distance(best)) best = group;
  return { group: best, exact: distance(best) === 0 };
}

/**
 * «Занятия для …»: название группы в родительном падеже.
 * «0–1 месяц» → «0–1 месяца», «1–2 месяца» → «1–2 месяцев», «2–3 года» → «2–3 лет».
 */
export function forAge(title: string): string {
  return title
    .replace(/месяца$/, 'месяцев')
    .replace(/месяц$/, 'месяца')
    .replace(/года$/, 'лет');
}
