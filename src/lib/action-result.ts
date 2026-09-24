/**
 * Ошибки, которые надо показать человеку.
 *
 * В боевой сборке Next.js прячет текст исключения из серверного действия —
 * вместо «Сон короче минуты» мама увидела бы «An error occurred in the Server
 * Components render». Поэтому понятные ошибки не пробрасываем, а возвращаем
 * значением { error }, а на клиенте unwrap() превращает их обратно в Error —
 * и обработчики в компонентах остаются прежними.
 */

export class UserError extends Error {}

export interface Failure {
  error: string;
}

/** Серверная сторона: UserError → { error }. Остальное (redirect, сбои) летит дальше. */
export async function guard<T>(job: () => Promise<T>): Promise<T | Failure> {
  try {
    return await job();
  } catch (cause) {
    if (cause instanceof UserError) return { error: cause.message };
    throw cause;
  }
}

function isFailure(value: unknown): value is Failure {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string';
}

/** Клиентская сторона: { error } → throw new Error(текст). */
export function unwrap<T>(result: T | Failure): T {
  if (isFailure(result)) throw new Error(result.error);
  return result;
}
