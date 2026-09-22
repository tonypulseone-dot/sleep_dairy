/**
 * Бот-хозяин мини-приложения.
 *
 * Его работа почти целиком — открыть дневник. Всё остальное происходит
 * внутри приложения, и раздувать бота командами незачем: Виктория
 * присылает маме ссылку, мама жмёт кнопку и оказывается в дневнике.
 *
 * Кнопку меню бот ставит себе сам при запуске, чтобы не заводить её
 * руками в BotFather и не разойтись с адресом приложения.
 */
import { Bot, InlineKeyboard } from 'grammy';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} не задан`);
  return value;
}

const token = required('TELEGRAM_BOT_TOKEN');
const appUrl = required('APP_URL');

// Telegram открывает мини-приложения только по https — иначе кнопка молча не сработает.
if (!appUrl.startsWith('https://')) {
  throw new Error('APP_URL должен начинаться с https://');
}

const bot = new Bot(token);

const openButton = (text = 'Открыть дневник') =>
  new InlineKeyboard().webApp(text, appUrl);

bot.command('start', async (ctx) => {
  // Хвост ссылки консультанта приезжает в /start и передаётся приложению как есть.
  const payload = ctx.match?.trim();
  const url = payload ? `${appUrl}/connect?c=${encodeURIComponent(payload)}` : appUrl;

  await ctx.reply(
    'Дневник сна малыша. Отмечайте сны одной кнопкой — остальное посчитается само.',
    { reply_markup: new InlineKeyboard().webApp('Открыть дневник', url) },
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Всё происходит внутри приложения: отметить сон, поправить запись, посмотреть итоги.\n\n' +
      'Если вы работаете с консультантом, откройте его ссылку — он увидит дневник в своём кабинете.',
    { reply_markup: openButton() },
  );
});

bot.on('message', async (ctx) => {
  await ctx.reply('Дневник открывается кнопкой ниже.', { reply_markup: openButton() });
});

bot.catch((error) => {
  console.error('Ошибка бота:', error.message);
});

async function main() {
  await bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Дневник', web_app: { url: appUrl } },
  });
  await bot.api.setMyCommands([
    { command: 'start', description: 'Открыть дневник' },
    { command: 'help', description: 'Как это работает' },
  ]);

  const me = await bot.api.getMe();
  console.log(`Бот @${me.username} запущен, приложение: ${appUrl}`);
  await bot.start();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
