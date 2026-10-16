'use client';

import { useState } from 'react';
import type { ActivitySection } from '@/db/schema';
import styles from './ActivityList.module.css';

/**
 * Занятия группы — разделами, как у Виктории в её списке: «👀 Зрение»,
 * «💦 Вода», «🧠 Причина → следствие». Кнопки сверху — быстрый переход к
 * одному разделу, когда мама уже знает, чего хочет (например, воду перед
 * купанием). Пункт читается так же, как у неё в тексте: «**Название** — описание»
 * или «**Название**: описание».
 */
export function ActivityList({ sections }: { sections: ActivitySection[] }) {
  const [only, setOnly] = useState<number | null>(null);
  const shown = only === null ? sections.map((section, index) => ({ section, index })) : [{ section: sections[only], index: only }];

  return (
    <>
      <div className={styles.chips} role="group" aria-label="Раздел">
        <button
          type="button"
          aria-pressed={only === null}
          className={`${styles.chip} ${only === null ? styles.chipOn : ''}`}
          onClick={() => setOnly(null)}
        >
          Все
        </button>
        {sections.map((section, index) => (
          <button
            key={section.title}
            type="button"
            aria-pressed={only === index}
            className={`${styles.chip} ${only === index ? styles.chipOn : ''}`}
            onClick={() => setOnly(only === index ? null : index)}
          >
            {section.title}
          </button>
        ))}
      </div>

      <div className={styles.sections}>
        {shown.map(({ section, index }) => (
          <section key={index} className={styles.section} aria-labelledby={`section-${index}`}>
            <h3 id={`section-${index}`} className={styles.title}>
              {section.title}
            </h3>
            {section.note && <p className={styles.note}>{section.note}</p>}
            <ul className={styles.items}>
              {section.items.map((item, i) => (
                <li key={i} className={styles.item}>
                  {item.title ? (
                    <>
                      <b>{item.title}</b>
                      {item.sep === ':' ? ': ' : ' — '}
                      {item.body}
                    </>
                  ) : (
                    item.body
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
