import { toUtcDayNumber } from './dates';

export interface TaskNode {
  id: number;
  title: string;
  durationDays: number;
  dueDate?: string | Date | null;
  /** Ids this task depends on: each must finish before this one starts. */
  dependencyIds: number[];
}

export interface ScheduledTask {
  id: number;
  title: string;
  durationDays: number;
  /** Whole days from project start. Day 0 means "can start immediately". */
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  /** Days this task can slip without delaying the project. Zero == critical. */
  slack: number;
  isCritical: boolean;
  /** Layer in the DAG, used both by CPM and by the graph layout. */
  depth: number;
  /** True when the earliest possible finish is already past the due date. */
  missesDueDate: boolean;
}

export interface Schedule {
  tasks: ScheduledTask[];
  /** Ids along one longest chain, in order. */
  criticalPath: number[];
  /** Duration of the whole project in days. */
  projectDuration: number;
}

export class CycleError extends Error {
  constructor(readonly cycle: number[]) {
    super(`Circular dependency: ${cycle.join(' -> ')}`);
    this.name = 'CycleError';
  }
}

const byId = (tasks: TaskNode[]) => new Map(tasks.map((task) => [task.id, task]));

/**
 * Kahn's algorithm. Returns ids in an order where every dependency precedes its
 * dependents, and throws if the graph is cyclic (a cycle leaves nodes that never
 * reach in-degree zero).
 *
 * Edges pointing at ids that aren't in `tasks` are ignored rather than fatal:
 * a concurrent delete shouldn't make the whole board un-renderable.
 */
export function topologicalOrder(tasks: TaskNode[]): number[] {
  const lookup = byId(tasks);
  const inDegree = new Map<number, number>();
  const dependents = new Map<number, number[]>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    dependents.set(task.id, []);
  }

  for (const task of tasks) {
    for (const dependencyId of task.dependencyIds) {
      if (!lookup.has(dependencyId)) continue;
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      dependents.get(dependencyId)!.push(task.id);
    }
  }

  // Sorted seed + sorted insertion keeps the output deterministic, which keeps
  // the rendered graph from reshuffling between reads.
  const queue = tasks
    .filter((task) => inDegree.get(task.id) === 0)
    .map((task) => task.id)
    .sort((a, b) => a - b);

  const order: number[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);

    for (const dependentId of dependents.get(id) ?? []) {
      const remaining = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, remaining);
      if (remaining === 0) queue.push(dependentId);
    }
    queue.sort((a, b) => a - b);
  }

  if (order.length !== tasks.length) {
    const stuck = tasks.filter((task) => !order.includes(task.id)).map((task) => task.id);
    throw new CycleError(stuck);
  }

  return order;
}

/**
 * Would adding `dependent -> dependency` close a loop?
 *
 * True when `dependency` already reaches `dependent` transitively, or when the
 * two are the same task. Depth-first from the proposed dependency, following
 * existing edges.
 */
export function wouldCreateCycle(
  tasks: TaskNode[],
  dependentId: number,
  dependencyId: number
): boolean {
  if (dependentId === dependencyId) return true;

  const lookup = byId(tasks);
  const seen = new Set<number>();
  const stack = [dependencyId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === dependentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const next of lookup.get(current)?.dependencyIds ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }

  return false;
}

/**
 * Critical Path Method over the dependency DAG.
 *
 * Forward pass gives each task the earliest it can start (once every dependency
 * has finished) and finish. Backward pass gives the latest it could start
 * without pushing the project end out. The difference is slack; zero slack means
 * any delay delays everything, which is the definition of the critical path.
 *
 * Durations are whole days and the project starts at day 0.
 */
export function computeSchedule(tasks: TaskNode[], projectStart: Date = new Date()): Schedule {
  const order = topologicalOrder(tasks);
  const lookup = byId(tasks);

  const earliestStart = new Map<number, number>();
  const earliestFinish = new Map<number, number>();
  const depth = new Map<number, number>();

  // Forward pass.
  for (const id of order) {
    const task = lookup.get(id)!;
    const duration = Math.max(0, task.durationDays);

    let start = 0;
    let layer = 0;
    for (const dependencyId of task.dependencyIds) {
      if (!lookup.has(dependencyId)) continue;
      start = Math.max(start, earliestFinish.get(dependencyId) ?? 0);
      layer = Math.max(layer, (depth.get(dependencyId) ?? 0) + 1);
    }

    earliestStart.set(id, start);
    earliestFinish.set(id, start + duration);
    depth.set(id, layer);
  }

  const projectDuration = Math.max(0, ...Array.from(earliestFinish.values(), (value) => value));

  // Backward pass: a task with no dependents may finish as late as the project.
  const dependentsOf = new Map<number, number[]>(tasks.map((task) => [task.id, []]));
  for (const task of tasks) {
    for (const dependencyId of task.dependencyIds) {
      dependentsOf.get(dependencyId)?.push(task.id);
    }
  }

  const latestFinish = new Map<number, number>();
  const latestStart = new Map<number, number>();

  for (const id of [...order].reverse()) {
    const task = lookup.get(id)!;
    const duration = Math.max(0, task.durationDays);
    const dependents = dependentsOf.get(id) ?? [];

    const finish =
      dependents.length === 0
        ? projectDuration
        : Math.min(...dependents.map((dependentId) => latestStart.get(dependentId) ?? projectDuration));

    latestFinish.set(id, finish);
    latestStart.set(id, finish - duration);
  }

  const scheduled: ScheduledTask[] = order.map((id) => {
    const task = lookup.get(id)!;
    const start = earliestStart.get(id)!;
    const finish = earliestFinish.get(id)!;
    const slack = latestStart.get(id)! - start;

    return {
      id,
      title: task.title,
      durationDays: task.durationDays,
      earliestStart: start,
      earliestFinish: finish,
      latestStart: latestStart.get(id)!,
      latestFinish: latestFinish.get(id)!,
      slack,
      isCritical: slack === 0,
      depth: depth.get(id)!,
      missesDueDate: missesDueDate(task.dueDate, finish, projectStart),
    };
  });

  return {
    tasks: scheduled,
    criticalPath: longestChain(scheduled, lookup),
    projectDuration,
  };
}

/**
 * Zero slack marks every critical task, but those can form several parallel
 * chains. Walk one of them start-to-end so the UI can draw a single path.
 */
function longestChain(scheduled: ScheduledTask[], lookup: Map<number, TaskNode>): number[] {
  const critical = scheduled.filter((task) => task.isCritical);
  if (critical.length === 0) return [];

  const criticalIds = new Set(critical.map((task) => task.id));
  const end = critical.reduce((latest, task) =>
    task.earliestFinish > latest.earliestFinish ? task : latest
  );

  const path = [end.id];
  let current = end;

  while (true) {
    const dependencies = (lookup.get(current.id)?.dependencyIds ?? []).filter((id) =>
      criticalIds.has(id)
    );
    if (dependencies.length === 0) break;

    // Follow the dependency that actually determined this task's start.
    const previous = dependencies
      .map((id) => scheduled.find((task) => task.id === id)!)
      .reduce((latest, task) => (task.earliestFinish > latest.earliestFinish ? task : latest));

    if (previous.earliestFinish !== current.earliestStart) break;
    path.unshift(previous.id);
    current = previous;
  }

  return path;
}

/** A deadline is impossible when the task cannot finish before it, even at full speed. */
function missesDueDate(
  dueDate: string | Date | null | undefined,
  earliestFinish: number,
  projectStart: Date
): boolean {
  if (!dueDate) return false;

  const startDay = Math.floor(
    Date.UTC(projectStart.getFullYear(), projectStart.getMonth(), projectStart.getDate()) /
      (24 * 60 * 60 * 1000)
  );
  return startDay + earliestFinish > toUtcDayNumber(new Date(dueDate));
}

/** Convert a day offset from project start into a real calendar date. */
export function dayOffsetToDate(offset: number, projectStart: Date = new Date()): Date {
  const start = Date.UTC(projectStart.getFullYear(), projectStart.getMonth(), projectStart.getDate());
  return new Date(start + offset * 24 * 60 * 60 * 1000);
}