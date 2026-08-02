const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DueState = 'overdue' | 'today' | 'upcoming';

export interface DueStatus {
  state: DueState;
  /** Whole calendar days from today to the due date. Negative when overdue. */
  daysRemaining: number;
  label: string;
}

/**
 * Due dates carry no time-of-day: they identify a calendar day. We store them as
 * UTC midnight so the stored instant is stable regardless of who wrote it, and
 * compare them as day numbers so no timezone offset can shift a date by one day.
 */
export function toUtcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_DAY);
}

/** The day number of `now` as the viewer's local calendar sees it. */
export function localDayNumber(now: Date): number {
  return Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY
  );
}

/**
 * Parse the `YYYY-MM-DD` value produced by `<input type="date">` into UTC
 * midnight. Returns null for empty input and throws for anything malformed, so
 * bad input fails loudly at the API boundary instead of silently becoming
 * `Invalid Date` in the database.
 */
export function parseDueDateInput(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('Due date must be a string');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Due date must be YYYY-MM-DD');

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Due date is not a real date');

  // Rejects overflow like 2025-02-31, which Date silently rolls into March.
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Due date is not a real date');
  }
  return parsed;
}

export function formatDueDate(dueDate: string | Date): string {
  return new Date(dueDate).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Classify a due date relative to `now`. A task is only overdue once its whole
 * due day has passed -- a task due today is not late at 9am.
 */
export function getDueStatus(dueDate: string | Date, now: Date = new Date()): DueStatus {
  const daysRemaining = toUtcDayNumber(new Date(dueDate)) - localDayNumber(now);

  if (daysRemaining < 0) {
    const overdueBy = Math.abs(daysRemaining);
    return {
      state: 'overdue',
      daysRemaining,
      label: overdueBy === 1 ? '1 day overdue' : `${overdueBy} days overdue`,
    };
  }
  if (daysRemaining === 0) {
    return { state: 'today', daysRemaining, label: 'Due today' };
  }
  return {
    state: 'upcoming',
    daysRemaining,
    label: daysRemaining === 1 ? 'Due tomorrow' : `Due ${formatDueDate(dueDate)}`,
  };
}
