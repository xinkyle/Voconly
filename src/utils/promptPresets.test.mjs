import test from 'node:test';
import assert from 'node:assert/strict';
import { getPromptOptions, resolvePrompt } from './promptPresets.ts';

const t = key => `default:${key}`;
test('all builtins and custom prompts are selectable independently of realtime scenes', () => {
  const options = getPromptOptions({ customPresets: { '文件整理': 'custom' } }, t);
  assert.equal(options.length, 6);
  assert.equal(options.at(-1).name, '文件整理');
});
test('shared saved builtin overrides default, empty builtin falls back', () => {
  assert.equal(resolvePrompt('lightPolish', { lightPolish: 'saved' }, t), 'saved');
  assert.equal(resolvePrompt('lightPolish', { lightPolish: '  ' }, t), 'default:llmConfig.presets.lightPolish');
});
test('custom edits apply immediately and removed preset cannot silently use a different prompt', () => {
  assert.equal(resolvePrompt('文件整理', { customPresets: { '文件整理': 'new' } }, t), 'new');
  assert.equal(resolvePrompt('文件整理', {}, t), undefined);
});
