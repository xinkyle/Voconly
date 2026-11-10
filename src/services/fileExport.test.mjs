import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { getExportContent, getExportFilename, exportFileRecord } from './fileExport.ts';

const record = { filename: '讨论.最终.mp3', transcriptText: '原文 👋', processedText: '处理结果' };
test('prefers nonblank AI result even after a failed retry; whitespace falls back to original', () => {
  assert.deepEqual(getExportContent({ ...record, aiStatus: 'error' }), { text: '处理结果', source: 'previousAi' });
  assert.deepEqual(getExportContent(record), { text: '处理结果', source: 'ai' });
  assert.deepEqual(getExportContent({ ...record, processedText: ' \n ' }), { text: '原文 👋', source: 'original' });
});
test('default filename uses audio basename, safe characters and actual format extension', () => {
  assert.equal(getExportFilename(record.filename, 'docx'), '讨论.最终.docx');
  assert.equal(getExportFilename('C:\\audio\\note.wav', 'txt'), 'note.txt');
  assert.equal(getExportFilename('a:b?.wav', 'txt'), 'a_b_.txt');
  assert.equal(getExportFilename('CON.mp3', 'docx'), '_CON.docx');
});
test('cancelling save never writes a file', async () => {
  assert.equal(await exportFileRecord(record, 'txt', {
    save: async () => null,
    write: async () => assert.fail('must not write'),
  }), null);
});
test('TXT exports chosen text as UTF-8, preserves line breaks and writes exact selected path', async () => {
  const original = { filename: '中文.wav', transcriptText: '第一行\nsecond 👋' };
  const result = await exportFileRecord(original, 'txt', {
    save: async options => { assert.equal(options.defaultPath, '中文.txt'); return 'D:/chosen/no-extension'; },
    write: async (path, bytes) => {
      assert.equal(path, 'D:/chosen/no-extension');
      assert.equal(new TextDecoder().decode(bytes), original.transcriptText);
    },
  });
  assert.equal(result, 'D:/chosen/no-extension');
});
test('write errors propagate and empty content cannot be exported', async () => {
  await assert.rejects(exportFileRecord(record, 'txt', { save: async () => '/out.txt', write: async () => { throw Error('disk full'); } }), /disk full/);
  await assert.rejects(exportFileRecord({ ...record, processedText: '', transcriptText: ' ' }, 'txt', { save: async () => assert.fail('must not open'), write: async () => {} }), /EMPTY_EXPORT/);
});
test('DOCX is valid OOXML with real headings, bold, numbering, multilingual text and escaped characters', async () => {
  const content = '# 会议记录\n\n**重点** 与 A & B < C\n\n3. 第一项\n4. 第二项\n\n- 中文 👋\n\n```js\nconst x = 1;\n```';
  let exported;
  await exportFileRecord({ ...record, processedText: content }, 'docx', { save: async () => '/out.docx', write: async (_, bytes) => { exported = bytes; } });
  const zip = await JSZip.loadAsync(exported);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /w:pStyle w:val="Heading1"/);
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /w:numPr/);
  assert.match(xml, /A &amp; B &lt; C/);
  assert.match(xml, /中文 👋/);
  assert.match(xml, /const x = 1;/);
  assert.doesNotMatch(xml, /\*\*重点\*\*/);
  assert.match(await zip.file('word/numbering.xml').async('string'), /w:start w:val="3"/);
});
test('raw transcripts keep literal Markdown markers in Word', async () => {
  let exported;
  await exportFileRecord({ ...record, processedText: '', transcriptText: '# 原文 **不要改变**' }, 'docx', { save: async () => '/raw.docx', write: async (_, bytes) => { exported = bytes; } });
  const xml = await (await JSZip.loadAsync(exported)).file('word/document.xml').async('string');
  assert.match(xml, /# 原文 \*\*不要改变\*\*/);
});

test('Word preserves AI line breaks and converts Markdown tables and strikethrough', async () => {
  let exported;
  await exportFileRecord({ ...record, processedText: 'first\nsecond\n\n~~removed~~\n\n| Name | Value |\n| --- | --- |\n| 项目 | 内容 |' }, 'docx', {
    save: async () => '/table.docx', write: async (_, bytes) => { exported = bytes; },
  });
  const xml = await (await JSZip.loadAsync(exported)).file('word/document.xml').async('string');
  assert.match(xml, /<w:br\/>/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:strike\/>/);
});

test('Word decodes Markdown entities but preserves literal code', async () => {
  let exported;
  await exportFileRecord({ ...record, processedText: 'A &amp; B\n\n`&amp;`' }, 'docx', {
    save: async () => '/entities.docx', write: async (_, bytes) => { exported = bytes; },
  });
  const xml = await (await JSZip.loadAsync(exported)).file('word/document.xml').async('string');
  assert.match(xml, />A &amp; B<\/w:t>/);
  assert.match(xml, />&amp;amp;<\/w:t>/);
});

test('task checkbox and its text stay together in one Word list paragraph', async () => {
  let exported;
  await exportFileRecord({ ...record, processedText: '- [x] Completed' }, 'docx', {
    save: async () => '/task.docx', write: async (_, bytes) => { exported = bytes; },
  });
  const xml = await (await JSZip.loadAsync(exported)).file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:p>/g) || []).length, 1);
  assert.match(xml, /\[x\]/);
  assert.match(xml, /Completed/);
});
