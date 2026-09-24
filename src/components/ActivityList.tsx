'use client';

import { useState } from 'react';
import { IconBolt, IconMoon, IconSparkle } from './Icons';
import styles from './ActivityList.module.css';

export type Energy = 'active' | 'explore' | 'calm';

export interface ActivityView {
  id: string;
  title: string;
  body: string;
  energy: Energy;
  minutes: number | null;
}

/**
 * Три энергии — в порядке окна бодрствования: проснулся — подвигаться,
 * середина — поиграть, ближе ко сну — спокойное. Цвет всегда идёт вместе
 * со значком и подписью, никогда не один.
 */
export const ENERGY: Record<Energy, { label: string; when: string; Icon: typeof IconBolt }> = {
  active: { label: 'Подвигаться', when: 'в начале', Icon: IconBolt },
  explore: { label: 'Поиграть', when: 'в середине', Icon: IconSparkle },
  calm: { label: 'Спокойно', when: 'перед сном', Icon: IconMoon },
};

const ORDER: Energy[] = ['active', 'explore', 'calm'];

export function ActivityList({ items }: { items: ActivityView[] }) {
  const [filter, setFilter] = useState<Energy | null>(null);
  const shown = filter ? items.filter((item) => item.energy === filter) : items;
  const count = (energy: Energy) => items.filter((item) => item.energy === energy).length;

  return (
    <>
      {/* Подсказка и фильтр одновременно: три шага окна бодрствования. */}
      <div className={styles.flow} role="group" aria-label="Что подходит сейчас">
        {ORDER.map((energy) => {
          const { label, when, Icon } = ENERGY[energy];
          const on = filter === energy;
          return (
            <button
              key={energy}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(on ? null : energy)}
              className={`${styles.step} ${styles[energy]} ${on ? styles.stepOn : ''} ${
                filter && !on ? styles.stepOff : ''
              }`}
            >
              <span className={styles.stepIcon} aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className={styles.stepLabel}>{label}</span>
              <span className={styles.stepWhen}>
                {when} · {count(energy)}
              </span>
            </button>
          );
        })}
      </div>

      {filter && (
        <button type="button" className={styles.reset} onClick={() => setFilter(null)}>
          Показать все {items.length}
        </button>
      )}

      <ul className={styles.list}>
        {shown.map((item) => {
          const { label, Icon } = ENERGY[item.energy];
          return (
            <li key={item.id} className={`${styles.card} ${styles[item.energy]}`}>
              <div className={styles.meta}>
                <span className={styles.badge}>
                  <Icon size={14} />
                  {label}
                </span>
                {item.minutes !== null && <span className={styles.minutes}>≈ {item.minutes} мин</span>}
              </div>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
