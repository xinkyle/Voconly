import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveVoiceInput } from './liveVoiceInput.ts';

test('outputs confirmed text during recording, then flushes only the remaining suffix', async () => {
  const chunks = [];
  const session = new LiveVoiceInput(1, async (text) => {
    chunks.push(text);
    return { success: true };
  });

  session.update('第一段。');
  assert.deepEqual(chunks, ['第一段。']);
  session.update('第一段。');
  session.update('第一段。 第二段。');
  await session.finish('第一段。 第二段。 最后一段。');

  assert.equal(chunks.join(''), '第一段。 第二段。 最后一段。');
  assert.equal(session.interrupted, false);
});

test('cancellation discards updates queued behind an in-flight paste', async () => {
  const chunks = [];
  let resolvePaste;
  const session = new LiveVoiceInput(2, (text) => {
    chunks.push(text);
    return new Promise(resolve => { resolvePaste = resolve; });
  });
  session.update('first');
  session.update('first second');
  session.cancel();
  resolvePaste({ success: true });
  await session.finish('first second third');

  assert.deepEqual(chunks, ['first']);
});

test('a failed paste blocks subsequent output while preserving the transcript', async () => {
  const chunks = [];
  const session = new LiveVoiceInput(3, async (text) => {
    chunks.push(text);
    return { success: false };
  });

  session.update('first');
  await session.finish('first second');
  assert.deepEqual(chunks, ['first']);
  assert.equal(session.transcript, 'first second');
  assert.equal(session.interrupted, true);
});

test('ignores old snapshots and treats a rewritten finalized prefix as interrupted', async () => {
  const chunks = [];
  const session = new LiveVoiceInput(4, async (text) => {
    chunks.push(text);
    return { success: true };
  });

  session.update('confirmed');
  session.update('confirm');
  await session.finish('corrected');
  session.update('corrected late');
  assert.deepEqual(chunks, ['confirmed']);
  assert.equal(session.transcript, 'corrected');
  assert.equal(session.interrupted, true);
});

test('a final snapshot arriving as an in-flight paste settles is still flushed', async () => {
  const chunks = [];
  let resolvePaste;
  const session = new LiveVoiceInput(5, (text) => {
    chunks.push(text);
    if (chunks.length === 1) return new Promise(resolve => { resolvePaste = resolve; });
    return Promise.resolve({ success: true });
  });
  session.update('first');
  resolvePaste({ success: true });
  await Promise.resolve();
  await session.finish('first second');
  assert.equal(chunks.join(''), 'first second');
});

test('an incomplete recognition still sends the final confirmed prefix', async () => {
  const chunks = [];
  const session = new LiveVoiceInput(6, async (text) => {
    chunks.push(text);
    return { success: true };
  });
  session.markRecognitionIncomplete();
  await session.finish('confirmed');
  assert.deepEqual(chunks, ['confirmed']);
  assert.equal(session.interrupted, true);
});
