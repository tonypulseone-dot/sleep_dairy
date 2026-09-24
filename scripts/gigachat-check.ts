/**
 * Проверка GigaChat на сервере — доступ, сертификат и распознавание.
 *
 *   docker compose exec app node runtime/gigachat-check.cjs
 *       — ключ, сертификат, доступные модели;
 *   docker compose cp ~/shot.png app:/tmp/shot.png
 *   docker compose exec app node runtime/gigachat-check.cjs /tmp/shot.png
 *       — плюс распознавание скриншота: сырой ответ модели и что из него взяли;
 *   docker compose exec app node runtime/gigachat-check.cjs --text "днём 9:30-10:45, ночь 20:15-6:40"
 *       — то же для заметок.
 */
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { askGigaChat, GIGACHAT_MODEL, gigachatConfigured, listModels } from '../src/lib/gigachat';
import { notesPrompt, parseRecognized, screenshotPrompt } from '../src/lib/import-parse';

async function main() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  console.log('Модель:', GIGACHAT_MODEL, '| scope:', process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS');
  console.log('Ключ задан:', gigachatConfigured() ? 'да' : 'НЕТ — впишите GIGACHAT_AUTH_KEY в .env и перезапустите: docker compose up -d');

  // Каждый сертификат разбираем по-настоящему: файл может быть на месте,
  // но склеен криво, и тогда Node его молча не подхватит.
  const ca = process.env.NODE_EXTRA_CA_CERTS;
  const blocks = ca && existsSync(ca) ? readFileSync(ca, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [] : [];
  const names: string[] = [];
  for (const block of blocks) {
    try {
      names.push(new X509Certificate(block).subject.replace(/\n/g, ', '));
    } catch {
      names.push('НЕ ЧИТАЕТСЯ');
    }
  }
  console.log(
    'Сертификат Минцифры:',
    names.length === 0
      ? 'НЕТ — пересоберите образ: docker compose build app'
      : `${ca}\n  ${names.map((name) => `• ${name}`).join('\n  ')}`,
  );
  if (!gigachatConfigured()) process.exit(1);

  const models = await listModels();
  console.log('Доступ есть. Модели:', models.join(', '));
  if (!models.includes(GIGACHAT_MODEL)) console.log(`ВНИМАНИЕ: модели ${GIGACHAT_MODEL} нет в списке — задайте GIGACHAT_MODEL из списка выше`);

  const [arg, value] = process.argv.slice(2);
  if (!arg) return;

  const started = Date.now();
  let content: string;
  if (arg === '--text') {
    content = await askGigaChat(notesPrompt(today, value ?? ''));
  } else {
    const data = readFileSync(arg);
    const mime = /\.png$/i.test(arg) ? 'image/png' : 'image/jpeg';
    content = await askGigaChat(screenshotPrompt(today), { data, mime });
  }
  console.log(`\nОтвет модели за ${((Date.now() - started) / 1000).toFixed(1)} с:\n${content}\n`);
  console.log('Что возьмём в дневник:', JSON.stringify(parseRecognized(content, today), null, 2));
}

main().catch((error) => {
  console.error('ОШИБКА:', error instanceof Error ? error.message : error);
  process.exit(1);
});
