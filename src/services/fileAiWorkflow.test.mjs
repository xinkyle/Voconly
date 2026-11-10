import test from 'node:test';
import assert from 'node:assert/strict';
import { processFileRecord } from './fileAiWorkflow.ts';

const original = { id: 'file-1', transcriptText: '原文', processedText: '旧结果' };
const selection = { prompt: '整理 {text}', name: '整理', model: 'test-model' };

test('reprocessing uses original text and updates the same record', async () => {
  const saved = [];
  const result = await processFileRecord(original, selection, {
    process: async (text, prompt) => {
      assert.equal(text, '原文');
      assert.equal(prompt, selection.prompt);
      return { success: true, text: '新结果', error: null };
    },
    save: async record => { saved.push(record); },
  });
  assert.equal(result.id, original.id);
  assert.equal(result.transcriptText, '原文');
  assert.equal(result.processedText, '新结果');
  assert.equal(result.aiStatus, 'completed');
  assert.equal(saved.length, 1);
});

for (const error of ['CONTEXT_TOO_LONG:100:50', 'network error']) {
  test(`AI failure preserves original and previous result: ${error}`, async () => {
    const result = await processFileRecord(original, selection, {
      process: async () => ({ success: false, text: '原文', error }),
      save: async () => {},
    });
    assert.equal(result.transcriptText, '原文');
    assert.equal(result.processedText, '旧结果');
    assert.equal(result.aiStatus, 'error');
    assert.equal(result.aiError, error);
  });
}

test('thrown request failure is persisted without destroying prior success metadata', async () => {
  const result = await processFileRecord({ ...original, aiModelId: 'old-model', aiPromptName: 'old-prompt' }, selection, {
    process: async () => { throw new Error('offline'); },
    save: async () => {},
  });
  assert.equal(result.aiError, 'offline');
  assert.equal(result.aiModelId, 'old-model');
  assert.equal(result.aiPromptName, 'old-prompt');
});

test('persistence errors are surfaced rather than reported as AI success', async () => {
  await assert.rejects(processFileRecord(original, selection, {
    process: async () => ({ success: true, text: '结果', error: null }),
    save: async () => { throw new Error('disk full'); },
  }), /disk full/);
});

test('empty successful response is treated as failure', async () => {
  const result = await processFileRecord(original, selection, {
    process: async () => ({ success: true, text: '  ', error: null }),
    save: async () => {},
  });
  assert.equal(result.aiStatus, 'error');
  assert.equal(result.processedText, original.processedText);
});
