import Link from 'next/link';
import { Moon } from '@/components/Moon';
import styles from '@/components/Deleted.module.css';

/**
 * Экран после удаления дневника.
 *
 * Нужен именно отдельный экран: если бросить маму на главную, приложение
 * тут же заведёт её заново и покажет анкету — будет похоже, что удаление
 * не сработало. Здесь мы прямо говорим, что всё стёрто, и начать заново
 * можно, но только по её собственной кнопке.
 */
export default function DeletedPage() {
  return (
    <main className={styles.screen}>
      <Moon />
      <h1>Дневник удалён</h1>
      <p className={styles.text}>
        Записи о снах и кормлениях, данные малыша и доступ консультанта стёрты. Спасибо,
        что были с нами — и лёгких вам ночей.
      </p>
      <Link href="/" className={styles.again}>
        Начать заново
      </Link>
    </main>
  );
}
