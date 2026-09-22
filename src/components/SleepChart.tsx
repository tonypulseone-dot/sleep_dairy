'use client';

import { useState } from 'react';
import styles from './SleepChart.module.css';

/**
 * Динамика сна по дням.
 *
 * Виктория просила, чтобы аномалию было видно, не вчитываясь в цифры.
 * Столбцы составные: ночной сон снизу, дневной сверху — консультант читает
 * и общую величину, и из чего она сложилась, а это ровно те два числа,
 * которые он и так выписывает.
 *
 * Цвета те же, что в дневнике и в таблице: другой набор здесь означал бы,
 * что одно и то же на соседних экранах названо по-разному.
 */

export interface ChartDay {
  /** Подпись под столбцом: «вт 16». */
  label: string;
  /** Полная дата для подсказки. */
  title: string;
  daySleep: number;
  nightSleep: number;
}

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 22, right: 12, bottom: 28, left: 40 };

/** `195` → `"3:15"`. */
function hm(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export function SleepChart({ days }: { days: ChartDay[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const peak = Math.max(...days.map((day) => day.daySleep + day.nightSleep), 60);
  // Округляем шкалу вверх до целого часа, чтобы подписи сетки были круглыми.
  const max = Math.ceil(peak / 60) * 60;
  const y = (minutes: number) => PAD.top + plotHeight - (minutes / max) * plotHeight;

  const slot = plotWidth / Math.max(days.length, 1);
  const barWidth = Math.min(34, slot * 0.56);

  const gridStep = max > 720 ? 240 : 120;
  const grid = Array.from({ length: Math.floor(max / gridStep) + 1 }, (_, i) => i * gridStep);

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>Сколько спал по дням</span>
        <span className={styles.legend}>
          <span className={styles.key}>
            <i className={styles.swatchNight} aria-hidden="true" /> ночной
          </span>
          <span className={styles.key}>
            <i className={styles.swatchDay} aria-hidden="true" /> дневной
          </span>
        </span>
      </figcaption>

      <div className={styles.plot}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg} role="img"
             aria-label="Столбцы суточного сна по дням: ночной снизу, дневной сверху">
          {grid.map((minutes) => (
            <g key={minutes}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(minutes)}
                y2={y(minutes)}
                className={styles.grid}
              />
              <text x={PAD.left - 8} y={y(minutes)} className={styles.axis} textAnchor="end"
                    dominantBaseline="middle" fill="currentColor">
                {minutes / 60}ч
              </text>
            </g>
          ))}

          {days.map((day, index) => {
            const total = day.daySleep + day.nightSleep;
            const cx = PAD.left + slot * index + slot / 2;
            const x = cx - barWidth / 2;
            const nightTop = y(day.nightSleep);
            const base = y(0);
            // Зазор в 2px между сегментами — требование спецификации марок.
            const dayTop = y(total);
            const dayBottom = Math.max(dayTop, nightTop - 2);

            return (
              <g
                key={day.label}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                className={hovered !== null && hovered !== index ? styles.dim : undefined}
              >
                {/* Прозрачная мишень шире столбца: попадать мышью должно быть легко. */}
                <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotHeight} fill="transparent" />

                {day.nightSleep > 0 && (
                  <rect
                    x={x}
                    y={nightTop}
                    width={barWidth}
                    height={Math.max(0, base - nightTop)}
                    className={styles.night}
                  />
                )}
                {day.daySleep > 0 && (
                  <rect
                    x={x}
                    y={dayTop}
                    width={barWidth}
                    height={Math.max(0, dayBottom - dayTop)}
                    rx={4}
                    className={styles.day}
                  />
                )}

                {(hovered === index || (hovered === null && index === days.length - 1)) && total > 0 && (
                  <text x={cx} y={y(total) - 8} className={styles.value} textAnchor="middle" fill="currentColor">
                    {hm(total)}
                  </text>
                )}

                <text x={cx} y={HEIGHT - 9} className={styles.axis} textAnchor="middle" fill="currentColor">
                  {day.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered !== null && (
          <div className={styles.tip} role="status">
            <b>{days[hovered].title}</b>
            <span>
              суточный {hm(days[hovered].daySleep + days[hovered].nightSleep)} · ночной{' '}
              {hm(days[hovered].nightSleep)} · дневной {hm(days[hovered].daySleep)}
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}
