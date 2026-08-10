import { describe, expect, it } from 'vitest';
import { MAX_TITLE_LENGTH, parseDurationInput, parseRouteId, parseTitleInput } from './validation';

describe('parseRouteId', () => {
  it('accepts a canonical decimal id', () => {
    expect(parseRouteId('1')).toBe(1);
    expect(parseRouteId('4207')).toBe(4207);
  });

  // parseInt stops at the first character it cannot read, which turns three
  // different URLs into the same row. Only one spelling may address a task.
  it.each(['12abc', '12.9', '12e0', ' 12', '12 ', '+12', '0x10', '012'])(
    'rejects %j rather than reading a number out of the front of it',
    (value) => {
      expect(parseRouteId(value)).toBeNull();
    }
  );

  it.each(['0', '-1', 'NaN', 'Infinity', '', 'abc'])('rejects %j', (value) => {
    expect(parseRouteId(value)).toBeNull();
  });

  it('rejects ids past the safe integer range instead of losing precision', () => {
    expect(parseRouteId('99999999999999999999')).toBeNull();
  });
});

describe('parseDurationInput', () => {
  it('defaults an absent estimate to one day', () => {
    expect(parseDurationInput(undefined)).toBe(1);
    expect(parseDurationInput(null)).toBe(1);
    expect(parseDurationInput('')).toBe(1);
  });

  it('takes a number or the numeric string a form sends', () => {
    expect(parseDurationInput(7)).toBe(7);
    expect(parseDurationInput('7')).toBe(7);
    expect(parseDurationInput(' 5 ')).toBe(5);
  });

  it('allows zero, because a milestone is a task that takes no time', () => {
    expect(parseDurationInput(0)).toBe(0);
  });

  // Bare Number() would read all of these as an estimate: Number([7]) is 7,
  // Number(true) is 1, Number([]) is 0. None of them is a user typing days.
  it.each([[[7]], [true], [false], [{}], [[]]])('rejects %j', (value) => {
    expect(() => parseDurationInput(value)).toThrow(/whole number of days/i);
  });

  // A non-primitive used to reach Number() and surface a raw engine message
  // ("Cannot convert object to primitive value") to the caller.
  it('reports a bad type in its own words', () => {
    expect(() => parseDurationInput({ toString: 1 })).toThrow(/whole number of days/i);
  });

  it('rejects a negative or oversized estimate', () => {
    expect(() => parseDurationInput(-1)).toThrow(/negative/i);
    expect(() => parseDurationInput(366)).toThrow(/365/);
  });

  it('rejects a fraction of a day', () => {
    expect(() => parseDurationInput(1.5)).toThrow(/whole number/i);
  });
});

describe('parseTitleInput', () => {
  it('trims and keeps a real title', () => {
    expect(parseTitleInput('  paint the shed  ')).toBe('paint the shed');
  });

  it.each([['   '], [''], [null], [undefined], [42], [['a']], [{}]])(
    'rejects %j as a title',
    (value) => {
      expect(() => parseTitleInput(value)).toThrow(/required/i);
    }
  );

  it('rejects a title past the column limit', () => {
    expect(() => parseTitleInput('x'.repeat(MAX_TITLE_LENGTH + 1))).toThrow(/exceed/i);
  });
});

describe('parseTitleInput: normalisation', () => {
  it('collapses pasted newlines and tabs into one line', () => {
    expect(parseTitleInput('call\tthe\nroofer')).toBe('call the roofer');
    expect(parseTitleInput('spaced    out')).toBe('spaced out');
  });

  it('strips control characters rather than storing them', () => {
    expect(parseTitleInput('paint \u0000 the\u0007shed')).toBe('paint the shed');
  });

  it('rejects a title that is nothing but whitespace and control characters', () => {
    expect(() => parseTitleInput('\n\t  \u0000')).toThrow(/required/i);
  });
});
