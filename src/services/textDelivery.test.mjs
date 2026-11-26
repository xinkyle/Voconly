import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverTextOnce } from './textDelivery.ts';

for (const status of ['confirmed', 'submitted', 'not_submitted', 'uncertain']) {
  test(`delivery never retries or substitutes text after ${status}`, async () => {
    const calls = [];
    const outcome = { status, method: 'test', clipboardAvailable: false };
    const result = await deliverTextOnce('润色结果', async text => {
      calls.push(text);
      return outcome;
    });
    assert.deepEqual(calls, ['润色结果']);
    assert.equal(result, outcome);
  });
}

test('an IPC failure is uncertain and never triggers a second insertion', async () => {
  let calls = 0;
  const result = await deliverTextOnce('润色结果', async () => {
    calls++;
    throw new Error('IPC connection lost');
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.clipboardAvailable, false);
});
