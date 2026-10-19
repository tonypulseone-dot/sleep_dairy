'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { summarizeMetric, type MetricKey, type StatDay } from '@/lib/daily-stats';
import styles from './DailyStats.module.css';

/**
 * Статистика по дням — как Виктория её и описала: «просто цифры изо дня
 * в день», чтобы за пять дней одним взглядом увидеть, как, например,
 * уменьшался дневной сон.
 *
 * Каждая цифра суток — своя полоса: название, среднее и разброс, под ними
 * столбики дней со значением и разницей с предыдущим днём. Графиков нет —
 * их попросили убрать: динамику показывают сами цифры и стрелки ↑↓.
 * Наведение (или нажатие у консультанта) подсвечивает день и пишет его
 * словами — ничего не прячется за подсказкой.
 *
 * Цветная метка у названия — та же, что у сна в дневнике (ночной синий,
 * дневной янтарный); бодрствование — зелёным, суточный — нейтральным.
 * Текст — всегда цветами текста.
 */

export interface StatDayView extends StatDay {
  /** «пн» */
  weekday: string;
  /** «26» */
  date: string;
  /** «понедельник, 26 января» — для чтения вслух и подсветки. */
  full: string;
}

const METRICS: Record<MetricKey, { title: string; note: string }> = {
  wake: { title: 'Бодрствование', note: 'за сутки: с утра, между снами и перед ночью' },
  day: { title: 'Дневной сон', note: 'все дневные сны за сутки' },
  night: { title: 'Ночной сон', note: 'ночь, с которой начались сутки' },
  total: { title: 'Суточный сон', note: 'ночной и дневной вместе' },
};

/** 755 → «12:35». */
function clock(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  const value = Math.abs(minutes);
  return `${sign}${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** 41 → «41 мин», 130 → «2 ч 10 мин» — для фразы о разнице. */
function words(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

export function DailyStats({
  days,
  metrics,
  linkDays = false,
}: {
  days: StatDayView[];
  metrics: MetricKey[];
  /** Столбик дня ведёт в дневник этого дня (у мамы). У консультанта дневника нет. */
  linkDays?: boolean;
}) {
  if (days.every((day) => day.empty)) {
    return (
      <p className={styles.empty}>
        За эти дни записей нет. Выберите другой период или внесите сны вручную — цифры появятся здесь сами.
      </p>
    );
  }
  return (
    <div className={styles.list}>
      {metrics.map((key) => (
        <Metric key={key} metric={key} days={days} linkDays={linkDays} />
      ))}
    </div>
  );
}

function Metric({ metric, days, linkDays }: { metric: MetricKey; days: StatDayView[]; linkDays: boolean }) {
  const { title, note } = METRICS[metric];
  const summary = summarizeMetric(days, metric);
  const [active, setActive] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Свежие дни справа: если все не влезли, сразу показываем их, а не самые старые.
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [days.length]);

  const readout = (() => {
    if (active === null) {
      return summary.average === null ? (
        <>пока нет законченных суток</>
      ) : (
        <>
          в среднем <b>{clock(summary.average)}</b>
          {summary.min !== summary.max && (
            <>
              {' '}· от <b>{clock(summary.min!)}</b> до <b>{clock(summary.max!)}</b>
            </>
          )}
        </>
      );
    }
    const day = days[active];
    if (day.empty) return <>{day.full}: записей нет</>;
    const delta = summary.deltas[active];
    return (
      <>
        {day.full}: <b>{clock(day.values[metric])}</b>
        {day.isToday
          ? ', сутки ещё идут'
          : delta === null
            ? ''
            : delta === 0
              ? ', как накануне'
              : `, на ${words(Math.abs(delta))} ${delta > 0 ? 'больше' : 'меньше'}, чем накануне`}
      </>
    );
  })();

  return (
    <section className={styles.metric} data-metric={metric} aria-labelledby={`metric-${metric}`}>
      <header className={styles.head}>
        <h2 id={`metric-${metric}`} className={styles.title}>
          <i className={styles.key} aria-hidden="true" />
          {title}
        </h2>
        <span className={styles.note}>{note}</span>
        <p className={styles.readout} aria-live="polite">
          {readout}
        </p>
      </header>

      <div className={styles.scroller} ref={scroller}>
        <div className={styles.strip} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(var(--col), 1fr))` }}>
          {days.map((day, index) => {
            const delta = summary.deltas[index];
            const label = day.empty
              ? `${day.full}: записей нет`
              : `${day.full}: ${clock(day.values[metric])}${day.isToday ? ', сутки ещё идут' : ''}`;
            const body = (
              <>
                <span className={styles.weekday}>{day.isToday ? 'сег.' : day.weekday}</span>
                <span className={styles.date}>{day.date}</span>
                <span className={styles.value}>{day.empty ? '—' : clock(day.values[metric])}</span>
                <span className={styles.delta}>
                  {day.isToday && !day.empty
                    ? 'пока'
                    : delta === null
                      ? ' '
                      : delta === 0
                        ? '='
                        : `${delta > 0 ? '↑' : '↓'}${clock(Math.abs(delta))}`}
                </span>
              </>
            );
            const props = {
              className: `${styles.col} ${day.isToday ? styles.today : ''} ${day.empty ? styles.blank : ''} ${index === active ? styles.colOn : ''}`,
              'aria-label': label,
              onPointerEnter: () => setActive(index),
              onPointerLeave: () => setActive(null),
              onFocus: () => setActive(index),
              onBlur: () => setActive(null),
            };
            return linkDays ? (
              <Link key={day.sleepDay} href={`/day?d=${day.sleepDay}`} {...props}>
                {body}
              </Link>
            ) : (
              <div
                key={day.sleepDay}
                tabIndex={0}
                {...props}
                // На телефоне наводить нечем — нажатие показывает день словами.
                onClick={() => setActive(active === index ? null : index)}
              >
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
