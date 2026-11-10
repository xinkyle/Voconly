import { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType, Table, TableRow, TableCell, WidthType } from 'docx';
import { marked } from 'marked';
import { decodeHTML } from 'entities';
import type { Token, Tokens } from 'marked';
import type { IRunOptions, INumberingOptions } from 'docx';

function inline(tokens: Token[] = [], style: IRunOptions = {}): TextRun[] {
  return tokens.flatMap(token => {
    switch (token.type) {
      case 'strong': return inline(token.tokens, { ...style, bold: true });
      case 'em': return inline(token.tokens, { ...style, italics: true });
      case 'del': return inline(token.tokens, { ...style, strike: true });
      case 'br': return [new TextRun({ ...style, break: 1 })];
      case 'codespan': return [new TextRun({ ...style, text: token.text, font: 'Consolas' })];
      case 'link': return [...inline(token.tokens, style), new TextRun({ ...style, text: ` (${token.href})` })];
      case 'image': return [new TextRun({ ...style, text: token.text || token.href })];
      case 'text': return token.tokens ? inline(token.tokens, style) : [new TextRun({ ...style, text: decodeHTML(token.text) })];
      default: return 'tokens' in token && Array.isArray(token.tokens)
        ? inline(token.tokens, style) : [new TextRun({ ...style, text: 'text' in token ? String(token.text) : token.raw })];
    }
  });
}

export async function createWordBytes(text: string, markdown: boolean, title: string): Promise<Uint8Array> {
  const numbering: INumberingOptions['config'][number][] = [];
  const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

  function blocks(tokens: Token[] = [], depth = 0): (Paragraph | Table)[] {
    return tokens.flatMap((token): (Paragraph | Table)[] => {
      switch (token.type) {
        case 'space': return [];
        case 'heading': return [new Paragraph({ heading: headings[token.depth - 1], children: inline(token.tokens), keepNext: true })];
        case 'paragraph': case 'text': return [new Paragraph({ children: inline(token.tokens || marked.Lexer.lexInline(token.text)) })];
        case 'blockquote': return blocks(token.tokens, depth);
        case 'code': return (token as Tokens.Code).text.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 20 })], spacing: { after: 0 } }));
        case 'list': {
          const reference = `list-${numbering.length}`;
          const level = Math.min(depth, 8);
          numbering.push({ reference, levels: Array.from({ length: 9 }, (_, index) => ({
            level: index, format: token.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
            text: token.ordered ? `%${index + 1}.` : '•', alignment: AlignmentType.LEFT,
            start: token.ordered ? Number(token.start) || 1 : 1,
            style: { paragraph: { indent: { left: (index + 1) * 360, hanging: 240 } } },
          })) });
          return (token as Tokens.List).items.flatMap(item => {
            let first = true;
            return item.tokens.flatMap(child => {
              if (child.type === 'list') return blocks([child], depth + 1);
              if (child.type === 'space' || child.type === 'checkbox') return [];
              const content = child.type === 'text' || child.type === 'paragraph' ? inline(child.tokens || marked.Lexer.lexInline(child.text)) : inline(marked.Lexer.lexInline(child.raw));
              if (first && item.task) content.unshift(new TextRun(item.checked ? '[x] ' : '[ ] '));
              const paragraph = new Paragraph({ children: content, ...(first ? { numbering: { reference, level } } : { indent: { left: (level + 1) * 360 } }) });
              first = false;
              return [paragraph];
            });
          });
        }
        case 'table': return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
          new TableRow({ tableHeader: true, children: (token as Tokens.Table).header.map(cell => new TableCell({ children: [new Paragraph({ children: inline(cell.tokens, { bold: true }) })] })) }),
          ...(token as Tokens.Table).rows.map(row => new TableRow({ children: row.map(cell => new TableCell({ children: [new Paragraph({ children: inline(cell.tokens) })] })) })),
        ] })];
        case 'hr': return [new Paragraph({ text: '──────────' })];
        case 'def': return [];
        default: return [new Paragraph({ children: [new TextRun(token.raw)] })];
      }
    });
  }
  const children = markdown ? blocks(marked.lexer(text, { gfm: true, breaks: true })) : text.split(/\r\n|\r|\n/).map(line => new Paragraph({ children: [new TextRun(line)] }));
  const document = new Document({
    title, creator: 'Voconly',
    styles: { default: {
      document: { run: { font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft YaHei' }, size: 22, color: '000000' }, paragraph: { spacing: { after: 120, line: 276 } } },
      ...Object.fromEntries(headings.map((_, index) => [`heading${index + 1}`, { run: { color: '000000', bold: true, size: [32, 28, 26, 24, 22, 22][index] }, paragraph: { spacing: { before: 200, after: 120 }, keepNext: true } }])),
    } },
    numbering: { config: numbering },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
