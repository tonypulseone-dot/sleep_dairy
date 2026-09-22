import styles from './Moon.module.css';

/**
 * Луна для приветствия.
 *
 * Виктория просила «что-то красивое, может быть луна». Нарисована как
 * настоящий полумесяц с мягким свечением, а не мультяшный месяц в колпаке:
 * конкуренты все до одного уходят в детскую картинку, и спокойная взрослая
 * интонация — это то, чем мы от них отличаемся с первого экрана.
 *
 * Звёзды расставлены вручную, а не случайно: случайные прыгали бы при
 * каждой перерисовке.
 */

const STARS = [
  { x: 28, y: 34, r: 1.6, o: 0.9 },
  { x: 52, y: 18, r: 1.1, o: 0.6 },
  { x: 150, y: 28, r: 1.4, o: 0.75 },
  { x: 168, y: 62, r: 1, o: 0.5 },
  { x: 20, y: 96, r: 1.2, o: 0.55 },
  { x: 160, y: 132, r: 1.5, o: 0.8 },
  { x: 40, y: 150, r: 1, o: 0.45 },
  { x: 128, y: 164, r: 1.2, o: 0.6 },
];

export function Moon() {
  return (
    <svg viewBox="0 0 190 190" className={styles.moon} role="img" aria-label="Луна и звёзды">
      <defs>
        <radialGradient id="moon-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--night)" stopOpacity="0.28" />
          <stop offset="60%" stopColor="var(--night)" stopOpacity="0.07" />
          <stop offset="100%" stopColor="var(--night)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="moon-body" x1="30%" y1="10%" x2="75%" y2="95%">
          <stop offset="0%" stopColor="var(--moon-hi)" />
          <stop offset="100%" stopColor="var(--moon-lo)" />
        </linearGradient>
        {/* Полумесяц — это круг, из которого вырезан другой круг со смещением. */}
        <mask id="moon-crescent">
          <rect x="0" y="0" width="190" height="190" fill="#000" />
          <circle cx="95" cy="95" r="46" fill="#fff" />
          <circle cx="119" cy="80" r="42" fill="#000" />
        </mask>
      </defs>

      <circle cx="95" cy="95" r="90" fill="url(#moon-glow)" />

      {STARS.map((star, index) => (
        <circle
          key={index}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill="var(--ink-3)"
          opacity={star.o}
        />
      ))}

      <g mask="url(#moon-crescent)">
        <circle cx="95" cy="95" r="46" fill="url(#moon-body)" />
      </g>
    </svg>
  );
}
