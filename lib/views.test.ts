import { describe, expect, it } from 'vitest';
import { ViewItem, countByView, matchesQuery, selectTasks, summarise } from './views';

const now = new Date(2025, 5, 11, 12, 0, 0);

const item = (id: number, overrides: Partial<ViewItem> = {}): ViewItem => ({
  id,
  title: `T${id}`,
  completed: false,
  dueDate: null,
  createdAt: new Date(2025, 5, id),
  isCritical: false,
  missesDueDate: false,
  earliestStart: 0,
  ...overrides,
});

describe('views', () => {
  const open = item(1);
  const dueToday = item(2, { dueDate: '2025-06-11' });
  const late = item(3, { dueDate: '2025-06-01' });
  const later = item(4, { dueDate: '2025-06-20' });
  const critical = item(5, { isCritical: true });
  const finished = item(6, { completed: true, isCritical: true, dueDate: '2025-06-01' });
  const all = [open, dueToday, late, later, critical, finished];

  it('keeps finished work out of every view except Done', () => {
    const counts = countByView(all, now);

    expect(counts).toEqual({ all: 5, today: 2, upcoming: 1, critical: 1, done: 1 });
  });

  it('counts an overdue task under Today, since it still needs doing today', () => {
    const today = all.filter((task) => selectTasks([task], { view: 'today', query: '', sort: 'smart', now }).length);

    expect(today.map((task) => task.id)).toEqual([2, 3]);
  });

  it('treats an impossible deadline as critical even without zero slack', () => {
    const doomed = item(7, { missesDueDate: true, dueDate: '2025-06-12' });
    const selected = selectTasks([...all, doomed], { view: 'critical', query: '', sort: 'smart', now });

    expect(selected.map((task) => task.id)).toEqual([7, 5]);
  });

  it('filters by title, case-insensitively', () => {
    const tasks = [item(1, { title: 'Seal the wood' }), item(2, { title: 'call roofer' })];

    expect(tasks.filter((task) => matchesQuery(task, 'WOOD')).map((task) => task.id)).toEqual([1]);
    expect(tasks.filter((task) => matchesQuery(task, '  ')).map((task) => task.id)).toEqual([1, 2]);
  });
});

describe('sorting', () => {
  const options = { view: 'all' as const, query: '', now };

  it('puts an impossible deadline first, then what is due soonest', () => {
    const tasks = [
      item(1, { dueDate: '2025-06-20' }),
      item(2, { dueDate: '2025-06-12' }),
      item(3, { dueDate: '2025-06-30', missesDueDate: true }),
    ];

    const order = selectTasks(tasks, { ...options, sort: 'smart' }).map((task) => task.id);

    expect(order).toEqual([3, 2, 1]);
  });

  it('ranks a task that can start now above one that is still blocked', () => {
    const tasks = [item(1, { earliestStart: 4 }), item(2, { earliestStart: 0 })];

    expect(selectTasks(tasks, { ...options, sort: 'smart' }).map((task) => task.id)).toEqual([2, 1]);
  });

  it('sorts undated work last rather than first', () => {
    const tasks = [item(1), item(2, { dueDate: '2025-06-30' })];

    expect(selectTasks(tasks, { ...options, sort: 'due' }).map((task) => task.id)).toEqual([2, 1]);
  });

  it('keeps finished work at the bottom whatever the sort', () => {
    const tasks = [item(1, { completed: true, title: 'aaa' }), item(2, { title: 'zzz' })];

    expect(selectTasks(tasks, { ...options, view: 'done', sort: 'title' }).map((t) => t.id)).toEqual([1]);
    expect(
      selectTasks(tasks, { ...options, view: 'all', sort: 'title' }).map((task) => task.id)
    ).toEqual([2]);
  });
});

describe('summarise', () => {
  it('describes the outstanding plan', () => {
    const tasks = [item(1, { dueDate: '2025-06-01' }), item(2, { missesDueDate: true })];

    expect(summarise(tasks, 6, now)).toBe(
      "2 tasks left \u00b7 6 days of work \u00b7 1 overdue \u00b7 1 can't make its deadline"
    );
  });

  it('says something useful when there is nothing to do', () => {
    expect(summarise([], 0, now)).toBe('Nothing planned yet.');
    expect(summarise([item(1, { completed: true })], 0, now)).toBe('Everything is done.');
  });

  it('reads naturally in the singular', () => {
    expect(summarise([item(1)], 1, now)).toBe('1 task left \u00b7 1 day of work');
  });
});
