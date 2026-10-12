import type { StatDay } from '@/lib/daily-stats';

const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });
const full = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const short = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

/**
 * Подписи дня для статистики: «пн», «26», «понедельник, 26 января». Считаем
 * по самой дате, без часовых поясов — у сонных суток их нет, а сервер и
 * телефон тогда пишут одно и то же.
 */
export function withDayLabels<T extends StatDay>(day: T) {
  return {
    ...day,
    weekday: weekday.format(noon(day.sleepDay)).replace('.', ''),
    date: String(Number(day.sleepDay.slice(8))),
    full: full.format(noon(day.sleepDay)),
  };
}

/** «21 сент» — для подписи периода. */
export function shortDate(date: string): string {
  return short.format(noon(date)).replace('.', '');
}
