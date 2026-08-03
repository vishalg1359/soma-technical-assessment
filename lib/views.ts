import { getDueStatus, toUtcDayNumber, localDayNumber } from './dates';

export type ViewId = 'all' | 'today' | 'upcoming' | 'critical' | 'done';
export type SortId = 'smart' | 'due' | 'created' | 'title';

export const VIEWS: Array<{ id: ViewId; label: string; hint: string }> = [
  { id: 'all', label: 'All tasks', hint: 'Everything still open' },
  { id: 'today', label: 'Today', hint: 'Due today or already late' },
  { id: 'upcoming', label: 'Upcoming', hint: 'Has a date, further out' },
  { id: 'critical', label: 'Critical path', hint: 'No slack, or missing a deadline' },
  { id: 'done', label: 'Done', hint: 'Finished work' },
];

/** The slice of a task the list needs: schedule facts plus the record itself. */
export interface ViewItem {
  id: number;
  title: string;
  completed: boolean;
  dueDate?: string | Date | null;
  createdAt: string | Date;
  isCritical: boolean;
  missesDueDate: boolean;
  earliestStart: number;
}

const isDueBy = (item: ViewItem, now: Date) =>
  item.dueDate != null && toUtcDayNumber(new Date(item.dueDate)) <= localDayNumber(now);

/**
 * Which view a task belongs to. `all` deliberately hides finished work: a list
 * that keeps everything forever stops being a list of what to do.
 */
export function matchesView(item: ViewItem, view: ViewId, now: Date): boolean {
  switch (view) {
    case 'all':
      return !item.completed;
    case 'today':
      return !item.completed && isDueBy(item, now);
    case 'upcoming':
      return !item.completed && item.dueDate != null && !isDueBy(item, now);
    case 'critical':
      return !item.completed && (item.isCritical || item.missesDueDate);
    case 'done':
      return item.completed;
  }
}

export function countByView(items: ViewItem[], now: Date): Record<ViewId, number> {
  return VIEWS.reduce(
    (counts, view) => {
      counts[view.id] = items.filter((item) => matchesView(item, view.id, now)).length;
      return counts;
    },
    {} as Record<ViewId, number>
  );
}

/** Case-insensitive substring match on the title. */
export function matchesQuery(item: ViewItem, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  return trimmed === '' || item.title.toLowerCase().includes(trimmed);
}

const dueDay = (item: ViewItem) =>
  item.dueDate == null ? Number.POSITIVE_INFINITY : toUtcDayNumber(new Date(item.dueDate));

const created = (item: ViewItem) => new Date(item.createdAt).getTime();

/**
 * `smart` is the default because it answers "what should I look at": anything
 * that can no longer make its deadline, then what is late or due, then what can
 * actually be started, then the rest. The others are plain single-key orders.
 */
const COMPARATORS: Record<SortId, (a: ViewItem, b: ViewItem) => number> = {
  smart: (a, b) =>
    Number(a.completed) - Number(b.completed) ||
    Number(b.missesDueDate) - Number(a.missesDueDate) ||
    dueDay(a) - dueDay(b) ||
    a.earliestStart - b.earliestStart ||
    Number(b.isCritical) - Number(a.isCritical) ||
    created(b) - created(a),
  due: (a, b) => Number(a.completed) - Number(b.completed) || dueDay(a) - dueDay(b) || created(b) - created(a),
  created: (a, b) => Number(a.completed) - Number(b.completed) || created(b) - created(a),
  title: (a, b) =>
    Number(a.completed) - Number(b.completed) || a.title.localeCompare(b.title),
};

export function sortTasks<T extends ViewItem>(items: T[], sort: SortId): T[] {
  return [...items].sort(COMPARATORS[sort]);
}

export function selectTasks<T extends ViewItem>(
  items: T[],
  options: { view: ViewId; query: string; sort: SortId; now: Date }
): T[] {
  const visible = items.filter(
    (item) => matchesView(item, options.view, options.now) && matchesQuery(item, options.query)
  );
  return sortTasks(visible, options.sort);
}

/** One line summarising the plan, shown under the header. */
export function summarise(items: ViewItem[], projectDuration: number, now: Date): string {
  const open = items.filter((item) => !item.completed);
  if (open.length === 0) {
    return items.length === 0 ? 'Nothing planned yet.' : 'Everything is done.';
  }

  const late = open.filter(
    (item) => item.dueDate != null && getDueStatus(item.dueDate, now).state === 'overdue'
  ).length;
  const impossible = open.filter((item) => item.missesDueDate).length;

  const parts = [
    `${open.length} task${open.length === 1 ? '' : 's'} left`,
    `${projectDuration} day${projectDuration === 1 ? '' : 's'} of work`,
  ];
  if (late > 0) parts.push(`${late} overdue`);
  if (impossible > 0) parts.push(`${impossible} can't make its deadline`);

  return parts.join(' \u00b7 ');
}
