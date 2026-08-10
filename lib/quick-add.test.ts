import { describe, expect, it } from 'vitest';
import { dayOffsetToInput, parseQuickAdd } from './quick-add';

// A Wednesday, chosen at local noon so the parsed day can't drift across a
// timezone boundary the way an ISO string would.
const wednesday = new Date(2025, 5, 11, 12, 0, 0);

describe('parseQuickAdd', () => {
  it('leaves a plain sentence alone', () => {
    const parsed = parseQuickAdd('call the roofer', wednesday);

    expect(parsed).toMatchObject({ title: 'call the roofer', dueDate: null, durationDays: 1 });
  });

  it('lifts "tomorrow" out of the title', () => {
    const parsed = parseQuickAdd('seal the wood tomorrow', wednesday);

    expect(parsed.title).toBe('seal the wood');
    expect(parsed.dueDate).toBe('2025-06-12');
  });

  it('reads an estimate written as 3d or 3 days', () => {
    expect(parseQuickAdd('sand the deck 3d', wednesday).durationDays).toBe(3);
    expect(parseQuickAdd('sand the deck 3 days', wednesday).durationDays).toBe(3);
    expect(parseQuickAdd('sand the deck 3d', wednesday).title).toBe('sand the deck');
  });

  it('reads a date and an estimate from the same line', () => {
    const parsed = parseQuickAdd('build the frame friday 4d', wednesday);

    expect(parsed).toMatchObject({
      title: 'build the frame',
      dueDate: '2025-06-13',
      durationDays: 4,
    });
  });

  it('treats a weekday as the next one, never today', () => {
    // Parsing "wednesday" on a Wednesday means the Wednesday coming.
    expect(parseQuickAdd('order timber wednesday', wednesday).dueDate).toBe('2025-06-18');
  });

  it('understands relative phrases', () => {
    expect(parseQuickAdd('inspect in 3 days', wednesday).dueDate).toBe('2025-06-14');
    expect(parseQuickAdd('inspect next week', wednesday).dueDate).toBe('2025-06-18');
    expect(parseQuickAdd('inspect today', wednesday).dueDate).toBe('2025-06-11');
  });

  it('understands an explicit month and day, in either order', () => {
    expect(parseQuickAdd('pay invoice aug 12', wednesday).dueDate).toBe('2025-08-12');
    expect(parseQuickAdd('pay invoice 12 august', wednesday).dueDate).toBe('2025-08-12');
    expect(parseQuickAdd('pay invoice August 12th', wednesday).dueDate).toBe('2025-08-12');
  });

  it('rolls a month that has already passed into next year', () => {
    expect(parseQuickAdd('renew licence jan 4', wednesday).dueDate).toBe('2026-01-04');
  });

  it('ignores a date that does not exist', () => {
    const parsed = parseQuickAdd('do the thing feb 31', wednesday);

    expect(parsed.dueDate).toBeNull();
    expect(parsed.title).toBe('do the thing feb 31');
  });

  it('ignores an absurd estimate rather than accepting it', () => {
    const parsed = parseQuickAdd('rebuild everything 900 days', wednesday);

    expect(parsed.durationDays).toBe(1);
    expect(parsed.title).toBe('rebuild everything 900 days');
  });

  it('reports what it consumed so the input can highlight it', () => {
    const parsed = parseQuickAdd('paint it tomorrow 2d', wednesday);

    expect(parsed.matched).toEqual({ due: 'tomorrow', duration: '2d' });
  });

  it('does not strip a word that merely contains a keyword', () => {
    // "monday" is a weekday; "monitor" is not, even though it starts with "mon".
    const parsed = parseQuickAdd('monitor the drying', wednesday);

    expect(parsed.title).toBe('monitor the drying');
    expect(parsed.dueDate).toBeNull();
  });

  it('collapses the whitespace left behind by what it removed', () => {
    expect(parseQuickAdd('stain   the  rails tomorrow', wednesday).title).toBe('stain the rails');
  });
});

describe('dayOffsetToInput', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // 23:00 local is already tomorrow in UTC east of the meridian.
    const late = new Date(2025, 5, 11, 23, 0, 0);

    expect(dayOffsetToInput(0, late)).toBe('2025-06-11');
    expect(dayOffsetToInput(1, late)).toBe('2025-06-12');
  });

  it('survives a spring-forward DST transition', () => {
    expect(dayOffsetToInput(7, new Date(2025, 2, 7, 12, 0, 0))).toBe('2025-03-14');
  });
});

describe('parseQuickAdd: words that only look like dates', () => {
  // "sun", "sat", "wed" and "mon" are ordinary English before they are weekdays.
  // Reading them as dates deletes a noun from the title and invents a deadline.
  it.each([
    ['buy sun cream', 'buy sun cream'],
    ['monitor the sun', 'monitor the sun'],
    ['sat with mom', 'sat with mom'],
    ['wed the client', 'wed the client'],
    ['mon the ramparts', 'mon the ramparts'],
  ])('leaves %j alone', (input, title) => {
    const parsed = parseQuickAdd(input, wednesday);

    expect(parsed.title).toBe(title);
    expect(parsed.dueDate).toBeNull();
  });

  it('still reads an abbreviation once a date word announces it', () => {
    expect(parseQuickAdd('ship the build on fri', wednesday)).toMatchObject({
      title: 'ship the build',
      dueDate: '2025-06-13',
    });
    expect(parseQuickAdd('ship the build next fri', wednesday).dueDate).toBe('2025-06-13');
  });

  it('still reads a full weekday name on its own', () => {
    expect(parseQuickAdd('ship the build friday', wednesday)).toMatchObject({
      title: 'ship the build',
      dueDate: '2025-06-13',
    });
  });

  it('removes the occurrence that actually matched, not the first text like it', () => {
    // "today" appears at index 0 inside "todays", where the pattern does not
    // match. Cutting by text rather than by position carves up the wrong word.
    const parsed = parseQuickAdd('todays today', wednesday);

    expect(parsed.title).toBe('todays');
    expect(parsed.dueDate).toBe('2025-06-11');
  });
});
