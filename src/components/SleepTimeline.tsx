'use client';

import { useState } from 'react';
import styles from './SleepTimeline.module.css';

/**
 * Дневник клиентки для консультанта — не строчками, как в Excel, а сутками.
 *
 * Каждый день — шкала на 24 часа от маминой утренней границы, сны на ней —
 * цветными отрезками: ночной синим, дневной жёлтым, те же цвета, что в
 * дневнике мамы и на графике выше. Консультант видит ритм формой: где
 * провалы, где сон съехал, какая ночь короткая, — не вчитываясь в цифры.
 * Цифры никуда не делись: итоги дня справа, окна бодрствования под шкалой,
 * точное время каждого сна — в подсказке и в выгрузке.
 *
 * Пара цветов проверена валидатором (skill dataviz) на обоих фонах:
 * ΔE при дальтонизме 24–27, контраст к фону не ниже 3:1.
 */

export interface TimelineSegment {
  /** Минуты от начала сонных суток, 0…1440. */
  from: number;
  to: number;
  kind: 'day' | 'night';
  ongoing: boolean;
  start: string;
  end: string | null;
  duration: string;
}

export interface TimelineDay {
  sleepDay: string;
  /** «пн, 21 сент.» */
  label: string;
  isToday: boolean;
  segments: TimelineSegment[];
  wakeWindows: string[];
  total: string;
  day: string;
  night: string;
  napCount: number;
  /** «+0:40» / «−1:10» к среднему; пусто, если отклонение мелкое или день не закончен. */
  delta: { text: string; up: boolean } | null;
  /** Метка «сейчас» на сегодняшней шкале. */
  nowAt: number | null;
}

/**
 * Длительность внутри отрезка — только если она там помещается: подпись,
 * которая вылезает за свой отрезок, хуже, чем никакой (значение остаётся
 * в подсказке, итогах и выгрузке). Отрезки от 70 до 150 минут подписываем
 * только на широкой шкале — это решает CSS по ширине самой шкалы.
 */
const LABEL_MIN_MINUTES = 70;
const LABEL_ALWAYS_MINUTES = 150;

export function SleepTimeline({ days, dayBoundary }: { days: TimelineDay[]; dayBoundary: number }) {
  const [tip, setTip] = useState<{ day: string; index: number } | null>(null);

  // Часы оси: каждые три часа от утренней границы, как их читает консультант.
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const hour = (Math.floor(dayBoundary / 60) + i * 3) % 24;
    return { at: (i * 180) / 1440, label: `${hour}:00` };
  });

  return (
    <section className={styles.card} aria-label="Сны по дням">
      <header className={styles.head}>
        <h2 className={styles.title}>Сны по дням</h2>
        <div className={styles.legend}>
          <span className={styles.key}>
            <i className={`${styles.swatch} ${styles.night}`} aria-hidden="true" /> ночной сон
          </span>
          <span className={styles.key}>
            <i className={`${styles.swatch} ${styles.day}`} aria-hidden="true" /> дневной сон
          </span>
        </div>
      </header>

      <div className={styles.axisRow} aria-hidden="true">
        <span />
        <div className={styles.axis}>
          {ticks.map((tick, i) => (
            <span
              key={tick.label}
              className={`${styles.tick} ${i % 2 === 1 ? styles.tickMinor : ''}`}
              style={{ left: `${tick.at * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        <span className={styles.statsHead}>
          <span>за сутки</span>
          <span>днём</span>
          <span>ночью</span>
        </span>
      </div>

      <ol className={styles.rows}>
        {days.map((day) => (
          <li key={day.sleepDay} className={`${styles.row} ${day.isToday ? styles.today : ''}`}>
            <div className={styles.date}>
              <span className={styles.dateLabel}>{day.label}</span>
              {day.isToday && <span className={styles.todayTag}>сегодня</span>}
            </div>

            <div className={styles.trackCell}>
              <div className={styles.track}>
                {ticks.map((tick) => (
                  <i key={tick.label} className={styles.grid} style={{ left: `${tick.at * 100}%` }} aria-hidden="true" />
                ))}

                {day.segments.map((segment, index) => {
                  const kind = segment.kind === 'night' ? 'Ночной сон' : 'Дневной сон';
                  const span = `${segment.start}–${segment.end ?? 'идёт'}`;
                  const open = tip?.day === day.sleepDay && tip.index === index;
                  const show = () => setTip({ day: day.sleepDay, index });
                  const hide = () => setTip(null);
                  return (
                    <span
                      key={index}
                      role="img"
                      tabIndex={0}
                      aria-label={`${kind}, ${span}, ${segment.duration}`}
                      className={`${styles.segment} ${styles[segment.kind]} ${segment.ongoing ? styles.ongoing : ''}`}
                      style={{
                        left: `${(segment.from / 1440) * 100}%`,
                        width: `${((segment.to - segment.from) / 1440) * 100}%`,
                      }}
                      onPointerEnter={show}
                      onPointerLeave={hide}
                      onFocus={show}
                      onBlur={hide}
                    >
                      {segment.to - segment.from >= LABEL_MIN_MINUTES && (
                        <span
                          className={`${styles.segLabel} ${
                            segment.to - segment.from < LABEL_ALWAYS_MINUTES ? styles.segLabelWide : ''
                          }`}
                          aria-hidden="true"
                        >
                          {segment.duration}
                        </span>
                      )}
                      {open && (
                        <span className={styles.tip} role="status">
                          <b>{segment.duration}</b>
                          <span>
                            {kind.toLowerCase()} · {span}
                          </span>
                        </span>
                      )}
                    </span>
                  );
                })}

                {day.nowAt !== null && (
                  <i className={styles.now} style={{ left: `${(day.nowAt / 1440) * 100}%` }} aria-hidden="true" />
                )}

                {day.segments.length === 0 && <span className={styles.none}>записей нет</span>}
              </div>

              {day.wakeWindows.length > 0 && (
                <p className={styles.windows}>
                  <span className={styles.windowsLabel}>бодрствования</span> {day.wakeWindows.join(' · ')}
                </p>
              )}
            </div>

            <div className={styles.stats}>
              <span className={styles.total}>
                {day.total}
                {day.delta && (
                  <small className={styles.delta} aria-label={`${day.delta.up ? 'больше' : 'меньше'} среднего на ${day.delta.text.slice(1)}`}>
                    {day.delta.up ? '▲' : '▼'} {day.delta.text}
                  </small>
                )}
              </span>
              <span className={styles.part}>
                {day.day}
                <small>{day.napCount > 0 ? `${day.napCount} сн.` : ' '}</small>
              </span>
              <span className={styles.part}>{day.night}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
