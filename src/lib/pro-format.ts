/**
 * Подписи для кабинета консультанта: возраст словами, дни «назад»,
 * склонения. Отдельно от страниц, чтобы список, дашборд и карточка
 * говорили одинаково.
 */

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function monthsSince(from: string, now: Date): number {
  const start = new Date(`${from}T00:00:00Z`);
  let value = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  if (now.getUTCDate() < start.getUTCDate()) value -= 1;
  return Math.max(0, value);
}

function daysSince(from: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000));
}

/** «5 месяцев», а младше двух месяцев — неделями: «6 недель». */
export function ageWords(from: string, now: Date): string {
  const months = monthsSince(from, now);
  if (months < 2) {
    const weeks = Math.floor(daysSince(from, now) / 7);
    return `${weeks} ${plural(weeks, 'неделя', 'недели', 'недель')}`;
  }
  return `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`;
}

/** Возраст в месяцах по дате рождения. */
export function ageMonths(birthDate: string, now: Date): number {
  return monthsSince(birthDate, now);
}

/** Возраст целиком: фактический и, если есть ПДР, скорректированный. */
export function ageLabel(birthDate: string, dueDate: string | null, now: Date): string {
  const actual = ageWords(birthDate, now);
  if (!dueDate) return actual;
  return `${actual} · скорректированный ${ageWords(dueDate, now)}`;
}

/** «сегодня», «вчера», «3 дня назад». */
export function daysAgo(days: number): string {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
}

/** Минуты от полуночи → «7:00». */
export function clockOf(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
