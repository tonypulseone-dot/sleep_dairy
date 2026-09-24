import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserError, guard, unwrap } from './action-result';

test('понятная ошибка возвращается текстом и снова становится Error на клиенте', async () => {
  const result = await guard(async () => {
    throw new UserError('Сон короче минуты');
  });
  assert.deepEqual(result, { error: 'Сон короче минуты' });
  assert.throws(() => unwrap(result), { message: 'Сон короче минуты' });
});

test('остальные исключения (redirect, сбой базы) не глотаются', async () => {
  await assert.rejects(guard(async () => { throw new Error('NEXT_REDIRECT'); }), { message: 'NEXT_REDIRECT' });
});

test('успешный результат проходит как есть', async () => {
  assert.equal(unwrap(await guard(async () => 'id-1')), 'id-1');
  assert.equal(unwrap(await guard(async () => undefined)), undefined);
});
