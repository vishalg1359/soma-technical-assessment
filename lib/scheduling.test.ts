import { describe, expect, it } from 'vitest';
import {
  CycleError,
  TaskNode,
  computeSchedule,
  dayOffsetToDate,
  topologicalOrder,
  wouldCreateCycle,
} from './scheduling';

const task = (
  id: number,
  durationDays: number,
  dependencyIds: number[] = [],
  dueDate?: string
): TaskNode => ({ id, title: `T${id}`, durationDays, dependencyIds, dueDate });

/**
 *   1(2) ─┐
 *          ├─> 3(4) ──> 4(1)
 *   2(5) ─┘
 * Critical path is 2 -> 3 -> 4 = 10 days; task 1 has 3 days of slack.
 */
const diamond = [task(1, 2), task(2, 5), task(3, 4, [1, 2]), task(4, 1, [3])];

describe('topologicalOrder', () => {
  it('places every dependency before its dependents', () => {
    expect(topologicalOrder(diamond)).toEqual([1, 2, 3, 4]);
  });

  it('is deterministic for independent tasks', () => {
    const tasks = [task(3, 1), task(1, 1), task(2, 1)];
    expect(topologicalOrder(tasks)).toEqual([1, 2, 3]);
    expect(topologicalOrder(tasks)).toEqual([1, 2, 3]);
  });

  it('throws on a direct cycle', () => {
    expect(() => topologicalOrder([task(1, 1, [2]), task(2, 1, [1])])).toThrow(CycleError);
  });

  it('throws on an indirect cycle', () => {
    const cyclic = [task(1, 1, [3]), task(2, 1, [1]), task(3, 1, [2])];
    expect(() => topologicalOrder(cyclic)).toThrow(CycleError);
  });

  it('ignores edges to tasks that no longer exist', () => {
    expect(topologicalOrder([task(1, 1, [99])])).toEqual([1]);
  });

  it('handles an empty board', () => {
    expect(topologicalOrder([])).toEqual([]);
  });
});

describe('wouldCreateCycle', () => {
  it('rejects a task depending on itself', () => {
    expect(wouldCreateCycle(diamond, 1, 1)).toBe(true);
  });

  it('rejects a direct back-edge', () => {
    expect(wouldCreateCycle(diamond, 1, 3)).toBe(true);
  });

  it('rejects a transitive back-edge several hops away', () => {
    // 4 depends on 3 depends on 1, so 1 -> 4 would close the loop.
    expect(wouldCreateCycle(diamond, 1, 4)).toBe(true);
  });

  it('allows an edge that keeps the graph acyclic', () => {
    expect(wouldCreateCycle(diamond, 4, 1)).toBe(false);
    expect(wouldCreateCycle(diamond, 2, 1)).toBe(false);
  });

  it('terminates on a graph that is already cyclic', () => {
    const cyclic = [task(1, 1, [2]), task(2, 1, [1])];
    expect(wouldCreateCycle(cyclic, 1, 2)).toBe(true);
  });
});

describe('computeSchedule', () => {
  it('starts independent tasks on day 0', () => {
    const { tasks } = computeSchedule([task(1, 3), task(2, 2)]);
    expect(tasks.map((t) => t.earliestStart)).toEqual([0, 0]);
  });

  it('starts a dependent task only once its slowest dependency finishes', () => {
    const { tasks } = computeSchedule(diamond);
    const three = tasks.find((t) => t.id === 3)!;
    // Waits for task 2 (5 days), not task 1 (2 days).
    expect(three.earliestStart).toBe(5);
    expect(three.earliestFinish).toBe(9);
  });

  it('reports the project duration as the longest chain', () => {
    expect(computeSchedule(diamond).projectDuration).toBe(10);
  });

  it('computes slack and marks only zero-slack tasks critical', () => {
    const { tasks } = computeSchedule(diamond);
    const slack = Object.fromEntries(tasks.map((t) => [t.id, t.slack]));

    expect(slack).toEqual({ 1: 3, 2: 0, 3: 0, 4: 0 });
    expect(tasks.filter((t) => t.isCritical).map((t) => t.id)).toEqual([2, 3, 4]);
  });

  it('returns the critical path in dependency order', () => {
    expect(computeSchedule(diamond).criticalPath).toEqual([2, 3, 4]);
  });

  it('treats a single task as its own critical path', () => {
    const schedule = computeSchedule([task(1, 4)]);
    expect(schedule.criticalPath).toEqual([1]);
    expect(schedule.projectDuration).toBe(4);
  });

  it('handles parallel chains of equal length', () => {
    const parallel = [task(1, 2), task(2, 2), task(3, 1, [1]), task(4, 1, [2])];
    const schedule = computeSchedule(parallel);
    expect(schedule.projectDuration).toBe(3);
    expect(schedule.tasks.every((t) => t.isCritical)).toBe(true);
  });

  it('assigns depth by layer for the graph layout', () => {
    const depth = Object.fromEntries(computeSchedule(diamond).tasks.map((t) => [t.id, t.depth]));
    expect(depth).toEqual({ 1: 0, 2: 0, 3: 1, 4: 2 });
  });

  it('propagates a delay: growing a critical task pushes the project out', () => {
    const slower = [task(1, 2), task(2, 8), task(3, 4, [1, 2]), task(4, 1, [3])];
    expect(computeSchedule(slower).projectDuration).toBe(13);
  });

  it('growing a slack task does not move the project end until slack runs out', () => {
    const within = computeSchedule([task(1, 5), task(2, 5), task(3, 4, [1, 2]), task(4, 1, [3])]);
    expect(within.projectDuration).toBe(10);

    const beyond = computeSchedule([task(1, 6), task(2, 5), task(3, 4, [1, 2]), task(4, 1, [3])]);
    expect(beyond.projectDuration).toBe(11);
  });

  it('throws rather than looping forever on a cyclic graph', () => {
    expect(() => computeSchedule([task(1, 1, [2]), task(2, 1, [1])])).toThrow(CycleError);
  });

  it('handles zero-duration milestones', () => {
    const { tasks } = computeSchedule([task(1, 0), task(2, 3, [1])]);
    expect(tasks.find((t) => t.id === 2)!.earliestStart).toBe(0);
  });

  describe('due date feasibility', () => {
    // Local noon on the 10th: the same calendar day in every timezone.
    const start = new Date(2025, 2, 10, 12, 0, 0);

    it('flags a deadline the chain cannot possibly meet', () => {
      // Task 2 takes 5 days from the 10th, so the 12th is impossible.
      const tasks = [task(1, 2), task(2, 5, [], '2025-03-12')];
      const two = computeSchedule(tasks, start).tasks.find((t) => t.id === 2)!;
      expect(two.missesDueDate).toBe(true);
    });

    it('accepts a deadline that is exactly reachable', () => {
      const tasks = [task(1, 5, [], '2025-03-15')];
      expect(computeSchedule(tasks, start).tasks[0].missesDueDate).toBe(false);
    });

    it('flags a deadline made impossible by an upstream dependency', () => {
      // Alone, task 2 would finish in 1 day; behind task 1 it cannot.
      const tasks = [task(1, 9), task(2, 1, [1], '2025-03-13')];
      const two = computeSchedule(tasks, start).tasks.find((t) => t.id === 2)!;
      expect(two.missesDueDate).toBe(true);
    });

    it('ignores tasks with no due date', () => {
      expect(computeSchedule([task(1, 99)], start).tasks[0].missesDueDate).toBe(false);
    });
  });
});

describe('completion', () => {
  const done = (node: TaskNode): TaskNode => ({ ...node, completed: true });

  it('costs nothing once finished, so the project shrinks', () => {
    const [one, two, three, four] = diamond;
    // Task 2 is the 5-day bottleneck. Finishing it drops the project from 10
    // days to 7: task 3 now waits only on task 1's two days.
    const schedule = computeSchedule([one, done(two), three, four]);

    expect(schedule.projectDuration).toBe(7);
    expect(schedule.tasks.find((t) => t.id === 3)!.earliestStart).toBe(2);
  });

  it('moves the critical path onto whatever is still outstanding', () => {
    const [one, two, three, four] = diamond;
    const schedule = computeSchedule([one, done(two), three, four]);

    // With the 5-day branch gone, the 2-day branch now determines the start.
    expect(schedule.criticalPath).toEqual([1, 3, 4]);
  });

  it('walks the path through a finished task rather than splitting it', () => {
    // 1(5) -> 2(4, done) -> 3(1): the chain is still one path even though its
    // middle link is no longer outstanding.
    const schedule = computeSchedule([task(1, 5), done(task(2, 4, [1])), task(3, 1, [2])]);

    expect(schedule.criticalPath).toEqual([1, 2, 3]);
    expect(schedule.tasks.filter((t) => t.isCritical).map((t) => t.id)).toEqual([1, 3]);
  });

  it('never marks a completed task critical, even with zero slack', () => {
    const schedule = computeSchedule([done(task(1, 4))]);

    expect(schedule.tasks[0].isCritical).toBe(false);
    expect(schedule.criticalPath).toEqual([]);
    expect(schedule.projectDuration).toBe(0);
  });

  it('stops flagging a missed deadline once the task is done', () => {
    const start = new Date(2025, 0, 10, 12, 0, 0);
    const overdue = task(1, 30, [], '2025-01-11');

    expect(computeSchedule([overdue], start).tasks[0].missesDueDate).toBe(true);
    expect(computeSchedule([done(overdue)], start).tasks[0].missesDueDate).toBe(false);
  });

  it('reports remaining days separately from the estimate', () => {
    const [open, finished] = computeSchedule([task(1, 3), done(task(2, 3))]).tasks;

    expect([open.durationDays, open.remainingDays]).toEqual([3, 3]);
    expect([finished.durationDays, finished.remainingDays]).toEqual([3, 0]);
  });

  it('keeps dependents blocked behind an unfinished dependency', () => {
    // Completing a *dependent* must not pull its dependency forward.
    const schedule = computeSchedule([task(1, 4), done(task(2, 2, [1]))]);

    expect(schedule.tasks.find((t) => t.id === 2)!.earliestStart).toBe(4);
    expect(schedule.projectDuration).toBe(4);
  });
});

describe('dayOffsetToDate', () => {
  // Offsets are anchored to the viewer's *local* calendar day, the same day
  // number due dates are compared against. These starts are therefore built in
  // local time -- an ISO string would mean a different day either side of UTC.
  const localNoon = (year: number, month: number, day: number) =>
    new Date(year, month - 1, day, 12, 0, 0);

  it('maps day 0 to the project start date', () => {
    expect(dayOffsetToDate(0, localNoon(2025, 3, 10)).toISOString()).toBe(
      '2025-03-10T00:00:00.000Z'
    );
  });

  it('advances by whole days and crosses month boundaries', () => {
    expect(dayOffsetToDate(25, localNoon(2025, 3, 10)).toISOString()).toBe(
      '2025-04-04T00:00:00.000Z'
    );
  });

  it('reads the local calendar day, not the UTC one', () => {
    // 23:00 local on the 10th is already the 11th in UTC east of the meridian,
    // and still the 10th west of it. The offset must follow the local day.
    const late = new Date(2025, 2, 10, 23, 0, 0);
    expect(dayOffsetToDate(1, late).toISOString()).toBe('2025-03-11T00:00:00.000Z');
  });

  it('survives a spring-forward DST transition', () => {
    // US DST starts 2025-03-09; a naive `+ n * 86400000` on a local timestamp
    // drifts an hour here and can land on the wrong day.
    expect(dayOffsetToDate(7, localNoon(2025, 3, 7)).toISOString()).toBe(
      '2025-03-14T00:00:00.000Z'
    );
  });
});
