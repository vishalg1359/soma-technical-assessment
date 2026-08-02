import { describe, expect, it } from 'vitest';
import { getDueStatus, parseDueDateInput } from './dates';

/**
 * `now` is always built from local components: the viewer's calendar day is what
 * decides overdue-ness, so these assertions hold in any timezone the suite runs in.
 */
const localTime = (y: number, m: number, d: number, h = 9, min = 0, s = 0) =>
  new Date(y, m - 1, d, h, min, s);

const dueOn = (iso: string) => `${iso}T00:00:00.000Z`;

describe('parseDueDateInput', () => {
  it('parses a date input value to UTC midnight', () => {
    expect(parseDueDateInput('2025-03-09')?.toISOString()).toBe('2025-03-09T00:00:00.000Z');
  });

  it('treats empty input as no due date', () => {
    expect(parseDueDateInput('')).toBeNull();
    expect(parseDueDateInput(null)).toBeNull();
    expect(parseDueDateInput(undefined)).toBeNull();
  });

  it('rejects malformed and impossible dates instead of coercing them', () => {
    expect(() => parseDueDateInput('09/03/2025')).toThrow();
    expect(() => parseDueDateInput('2025-13-01')).toThrow();
    expect(() => parseDueDateInput('2025-02-31')).toThrow();
    expect(() => parseDueDateInput(1741478400000)).toThrow();
  });
});

describe('getDueStatus', () => {
  it('marks a past date overdue', () => {
    const status = getDueStatus(dueOn('2025-03-07'), localTime(2025, 3, 9));
    expect(status.state).toBe('overdue');
    expect(status.label).toBe('2 days overdue');
  });

  it('singularises a one day overrun', () => {
    expect(getDueStatus(dueOn('2025-03-08'), localTime(2025, 3, 9)).label).toBe('1 day overdue');
  });

  it('does not mark a task due today as overdue', () => {
    const status = getDueStatus(dueOn('2025-03-09'), localTime(2025, 3, 9, 23, 59));
    expect(status.state).toBe('today');
    expect(status.label).toBe('Due today');
  });

  it('flips to overdue the moment the due day ends', () => {
    const due = dueOn('2025-03-09');
    expect(getDueStatus(due, localTime(2025, 3, 9, 23, 59, 59)).state).toBe('today');
    expect(getDueStatus(due, localTime(2025, 3, 10, 0, 0, 1)).state).toBe('overdue');
  });

  it('labels upcoming dates', () => {
    expect(getDueStatus(dueOn('2025-03-10'), localTime(2025, 3, 9)).label).toBe('Due tomorrow');
    expect(getDueStatus(dueOn('2025-03-20'), localTime(2025, 3, 9)).state).toBe('upcoming');
  });

  it('compares whole days, so a late evening does not make tomorrow overdue', () => {
    const status = getDueStatus(dueOn('2025-03-10'), localTime(2025, 3, 9, 23, 30));
    expect(status.state).toBe('upcoming');
    expect(status.daysRemaining).toBe(1);
  });

  it('does not shift the date for viewers behind UTC', () => {
    // 2025-03-09 in Los Angeles is still 2025-03-09, not the 8th.
    const status = getDueStatus(dueOn('2025-03-09'), localTime(2025, 3, 9, 0, 30));
    expect(status.state).toBe('today');
  });
});
