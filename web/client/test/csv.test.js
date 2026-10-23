import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../src/lib/csv.js';

describe('csvCell', () => {
  it('leaves plain text alone and renders null as empty', () => {
    expect(csvCell('TLS Gateway')).toBe('TLS Gateway');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('neutralises spreadsheet formulas in text, but not negative numbers', () => {
    for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) {
      expect(csvCell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell(-3.5)).toBe('-3.5');
  });
});

describe('toCsv', () => {
  it('writes a header and one line per row', () => {
    const csv = toCsv([{ n: 'A', s: 1 }, { n: '=x', s: 2 }], [{ label: 'Name', value: (r) => r.n }, { label: 'Score', value: (r) => r.s }]);
    expect(csv.split('\r\n')).toEqual(['Name,Score', 'A,1', "'=x,2"]);
  });
});
