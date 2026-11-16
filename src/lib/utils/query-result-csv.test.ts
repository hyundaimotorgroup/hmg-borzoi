import { describe, expect, it } from 'vitest';
import { serializeQueryResultCsv } from './query-result-csv';

describe('serializeQueryResultCsv', () => {
  it('serializes ordinary headers and multiple result rows in column order', () => {
    expect(serializeQueryResultCsv(['name', 'amount'], [['Kim', 100], ['Lee', 0]]))
      .toBe('"name","amount"\n"Kim","100"\n"Lee","0"');
  });

  it.each([
    ['a comma', 'customer,name', '"customer,name"'],
    ['a double quote', 'customer"name', '"customer""name"'],
    ['a line feed', 'customer\nname', '"customer\nname"'],
    ['a carriage return', 'customer\rname', '"customer\rname"'],
    ['a CRLF sequence', 'customer\r\nname', '"customer\r\nname"'],
    ['Korean text and a unit symbol', '온도, 평균(°C)', '"온도, 평균(°C)"'],
    ['combined special characters', 'customer,"name"\n(°C)', '"customer,""name""\n(°C)"'],
    ['an empty name', '', '""'],
  ])('escapes a header containing %s', (_description, header, expectedHeader) => {
    expect(serializeQueryResultCsv([header, 'amount'], [['Kim', 100]]))
      .toBe(`${expectedHeader},"amount"\n"Kim","100"`);
  });

  it('preserves Korean column names and their corresponding numeric values', () => {
    expect(serializeQueryResultCsv(['온도, 평균(°C)', '수집 건수'], [[23.5, 120]]))
      .toBe('"온도, 평균(°C)","수집 건수"\n"23.5","120"');
  });

  it('preserves escaping of commas, double quotes, and newlines in data cells', () => {
    expect(serializeQueryResultCsv(
      ['comma', 'quote', 'newline'],
      [['Kim, Lee', 'say "hello"', 'line 1\r\nline 2']],
    )).toBe('"comma","quote","newline"\n"Kim, Lee","say ""hello""","line 1\r\nline 2"');
  });

  it('preserves the existing String conversion of non-string cells', () => {
    expect(serializeQueryResultCsv(
      ['null', 'undefined', 'number', 'boolean', 'empty', 'object', 'array'],
      [[null, undefined, 0, false, '', { value: 1 }, [1, 2]]],
    )).toBe('"null","undefined","number","boolean","empty","object","array"\n"null","undefined","0","false","","[object Object]","1,2"');
  });

  it('exports only the header when the result has no rows', () => {
    expect(serializeQueryResultCsv(['customer,name', 'amount'], []))
      .toBe('"customer,name","amount"');
  });

  it('preserves an empty result with no columns or rows', () => {
    expect(serializeQueryResultCsv([], [])).toBe('');
  });
});
