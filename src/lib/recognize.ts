import { askGigaChat } from './gigachat';
import { parseRecognized, textPrompt, type Recognized } from './import-parse';
import { sleepsFromTranscript, transcribePrompt } from './import-transcript';

/**
 * Скриншот → сны, в два шага (см. import-transcript.ts):
 *  1. нейросеть переписывает текст с картинки;
 *  2. сны собирают правила; не справились — текст разбирает нейросеть,
 *     уже без картинки.
 */
export async function recognizeScreenshot(
  image: { data: Buffer; mime: string },
  today: string,
): Promise<{ result: Recognized; transcript: string; stage: 'rules' | 'model' }> {
  const transcript = await askGigaChat(transcribePrompt(), image);
  const byRules = sleepsFromTranscript(transcript, today);
  if (byRules) return { result: byRules, transcript, stage: 'rules' };
  const content = await askGigaChat(textPrompt(today, transcript, 'screenshot'));
  return { result: parseRecognized(content, today), transcript, stage: 'model' };
}

/** Заметки мамы → сны: текст сразу разбирает нейросеть. */
export async function recognizeNotes(text: string, today: string): Promise<Recognized> {
  return parseRecognized(await askGigaChat(textPrompt(today, text, 'notes')), today);
}
