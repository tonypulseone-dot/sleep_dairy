import type { DaySegment } from '@/lib/sleep-day';
import { partOfDay } from '@/lib/day-parts';
import styles from './SleepRing.module.css';

/**
 * Сутки кольцом.
 *
 * Консультанты читают день не списком, а формой: где сны, где провалы,
 * длинная ли ночь. Кольцо показывает это одним взглядом, а в центре стоит
 * та самая единственная кнопка — мама не уходит с экрана, чтобы увидеть день.
 *
 * Верх круга — утренняя граница этой мамы, а не полночь. Поэтому день
 * читается слева направо от подъёма, как она его и проживает.
 */

const SIZE = 284;
const CENTER = SIZE / 2;
const RADIUS = 112;
const TRACK_WIDTH = 11;

/** Зазор между соседними дугами — 2px поверхности, как требуют спецификации марок. */
const GAP_DEGREES = (2 / (2 * Math.PI * RADIUS)) * 360;

function polar(minutes: number, radius: number) {
  // Круг начинается сверху и идёт по часовой стрелке.
  const angle = ((minutes / 1440) * 360 - 90) * (Math.PI / 180);
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function arcPath(fromMinutes: number, toMinutes: number, radius: number): string {
  const start = polar(fromMinutes, radius);
  const end = polar(toMinutes, radius);
  const sweep = ((toMinutes - fromMinutes) / 1440) * 360;
  return [
    'M', start.x.toFixed(2), start.y.toFixed(2),
    'A', radius, radius, 0, sweep > 180 ? 1 : 0, 1, end.x.toFixed(2), end.y.toFixed(2),
  ].join(' ');
}

interface Props {
  segments: DaySegment[];
  /** Утренняя граница в минутах от полуночи — с неё начинается круг. */
  dayBoundary: number;
  /** Текущий момент в минутах от начала суток, если показываем сегодня. */
  nowMinutes: number | null;
  children: React.ReactNode;
}

export function SleepRing({ segments, dayBoundary, nowMinutes, children }: Props) {
  const gapMinutes = (GAP_DEGREES / 360) * 1440;

  // Текущий час на кольце: от начала часа до его конца, в минутах от начала суток.
  const clockNow = nowMinutes === null ? null : (dayBoundary + nowMinutes) % 1440;
  const hourStart = nowMinutes === null || clockNow === null ? null : nowMinutes - (clockNow % 60);
  const partNow = clockNow === null ? null : partOfDay(Math.floor(clockNow / 60));

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={styles.svg}
        role="img"
        aria-label={
          segments.length === 0
            ? 'Сутки без записей'
            : `Сутки: ${segments.length} ${segments.length === 1 ? 'сон' : 'сна'}`
        }
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          className={styles.track}
          strokeWidth={TRACK_WIDTH}
        />

        {/* Мягкая подсветка текущего часа — под дугами снов, чтобы их не перекрывать. */}
        {hourStart !== null && (
          <path
            d={arcPath(Math.max(0, hourStart), Math.min(1440, hourStart + 60), RADIUS)}
            fill="none"
            strokeWidth={TRACK_WIDTH + 8}
            strokeLinecap="round"
            className={styles.hour}
          />
        )}

        {/* Четверти суток словами, от маминой утренней границы. Текущая — ярче. */}
        {[0, 6, 12, 18].map((offset) => {
          const minutes = offset * 60;
          const outer = polar(minutes, RADIUS + 20);
          const part = partOfDay(Math.floor(((dayBoundary + minutes) % 1440) / 60));
          return (
            <text
              key={offset}
              x={outer.x}
              y={outer.y}
              className={`${styles.tick} ${part === partNow ? styles.tickNow : ''}`}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="currentColor"
            >
              {part}
            </text>
          );
        })}

        {segments.map((segment, index) => {
          const span = segment.to - segment.from;
          // Короткие сны не подрезаем: от них ничего бы не осталось.
          const trim = span > gapMinutes * 3 ? gapMinutes / 2 : 0;
          return (
            <path
              key={index}
              d={arcPath(segment.from + trim, segment.to - trim, RADIUS)}
              fill="none"
              strokeWidth={TRACK_WIDTH}
              strokeLinecap="round"
              className={`${segment.kind === 'night' ? styles.night : styles.day} ${
                segment.ongoing ? styles.ongoing : ''
              }`}
            />
          );
        })}

        {/* Метку «сейчас» выносим наружу кольца, иначе она сливается с концом дуги. */}
        {nowMinutes !== null && (
          <g className={styles.now}>
            <circle cx={polar(nowMinutes, RADIUS).x} cy={polar(nowMinutes, RADIUS).y} r={9} className={styles.nowHalo} />
            <circle cx={polar(nowMinutes, RADIUS).x} cy={polar(nowMinutes, RADIUS).y} r={4} className={styles.nowDot} />
          </g>
        )}
      </svg>

      <div className={styles.center}>{children}</div>
    </div>
  );
}
