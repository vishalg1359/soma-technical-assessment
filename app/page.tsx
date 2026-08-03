"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDueDate, getDueStatus } from '@/lib/dates';
import { ScheduledTask, computeSchedule, dayOffsetToDate } from '@/lib/scheduling';
import { TodoWithDependencies } from '@/lib/types';
import TaskImage from './components/TaskImage';
import TaskListSkeleton from './components/TaskListSkeleton';
import DependencyGraph from './components/DependencyGraph';

const MINUTE_MS = 60 * 1000;
const IMAGE_POLL_MS = 1500;

const DUE_STATE_CLASS = {
  overdue: 'text-red-600 font-semibold',
  today: 'text-amber-600 font-medium',
  upcoming: 'text-gray-500',
} as const;

const isAwaitingImage = (todo: TodoWithDependencies) =>
  todo.imageStatus === 'pending' || todo.imageStatus === 'resolving';

export default function Home() {
  const [newTodo, setNewTodo] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDuration, setNewDuration] = useState('1');
  const [todos, setTodos] = useState<TodoWithDependencies[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [imagesEnabled, setImagesEnabled] = useState(true);
  // Re-render on a timer so a task due today turns red at midnight without a reload.
  const [now, setNow] = useState(() => new Date());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos');
      if (!res.ok) throw new Error('Request failed');

      const payload = await res.json();
      // Guard the shape: a misrouted or errored endpoint should surface a
      // message, not crash the render with `todos.map is not a function`.
      if (!Array.isArray(payload)) throw new Error('Unexpected response shape');

      setTodos(payload);
      setError(null);
    } catch {
      setError('Could not load your todos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  // Without a Pexels key every task falls back to a placeholder; say so plainly
  // rather than letting it look broken.
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((config) => setImagesEnabled(config.imagesEnabled))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  // Poll only while something is still waiting on an image, then stop.
  useEffect(() => {
    const waiting = todos.some(isAwaitingImage);

    if (!waiting) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    if (!pollTimer.current) {
      pollTimer.current = setInterval(fetchTodos, IMAGE_POLL_MS);
    }

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [todos, fetchTodos]);

  /**
   * The server rejects cycles, so this should always succeed -- but rendering
   * must never crash on unexpected data, so a cycle degrades to "no schedule".
   */
  const schedule = useMemo(() => {
    try {
      return computeSchedule(
        todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          durationDays: todo.durationDays,
          dueDate: todo.dueDate,
          dependencyIds: todo.dependencyIds,
        })),
        now
      );
    } catch {
      return null;
    }
  }, [todos, now]);

  const scheduleById = useMemo(() => {
    const map = new Map<number, ScheduledTask>();
    for (const task of schedule?.tasks ?? []) map.set(task.id, task);
    return map;
  }, [schedule]);

  const titleById = useMemo(() => new Map(todos.map((todo) => [todo.id, todo.title])), [todos]);

  const edges = useMemo(
    () =>
      todos.flatMap((todo) =>
        todo.dependencyIds.map((dependencyId) => ({ from: dependencyId, to: todo.id }))
      ),
    [todos]
  );

  const handleAddTodo = async () => {
    if (!newTodo.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTodo,
          dueDate: newDueDate || null,
          durationDays: Number(newDuration) || 1,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not add that todo.');
        return;
      }
      setNewTodo('');
      setNewDueDate('');
      setNewDuration('1');
      await fetchTodos();
    } catch {
      setError('Could not add that todo.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteTodo = async (id: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Request failed');
      await fetchTodos();
    } catch {
      setError('Could not delete that todo.');
    }
  };

  const changeDependency = async (
    dependentId: number,
    dependencyId: number,
    method: 'POST' | 'DELETE'
  ) => {
    setError(null);
    try {
      const res = await fetch(`/api/todos/${dependentId}/dependencies`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependencyId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not update dependencies.');
        return;
      }
      await fetchTodos();
    } catch {
      setError('Could not update dependencies.');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500 p-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-4xl font-bold text-white">Things To Do App</h1>
          <p className="text-sm text-white/80 mt-2">
            {isLoading
              ? 'Loading your tasks\u2026'
              : todos.length === 0
                ? 'Nothing planned yet.'
                : `${todos.length} ${todos.length === 1 ? 'task' : 'tasks'}${
                    schedule ? ` \u00b7 ${schedule.projectDuration} days of work` : ''
                  }`}
          </p>
        </header>

        <section className="mb-6">
          <div className="flex">
            <label htmlFor="title" className="sr-only">
              Task
            </label>
            <input
              id="title"
              type="text"
              className="flex-grow rounded-l-full p-3 text-gray-700 placeholder:text-gray-400 focus:outline-none"
              placeholder="Add a new todo"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
            />
            <button
              onClick={handleAddTodo}
              disabled={isAdding || !newTodo.trim()}
              className="rounded-r-full bg-white p-3 font-medium text-indigo-600 transition duration-300 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {isAdding ? 'Adding\u2026' : 'Add'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-white bg-opacity-15 px-4 py-2">
            <div className="flex items-center gap-2">
              <label htmlFor="due-date" className="text-sm text-white">
                Due
              </label>
              <input
                id="due-date"
                type="date"
                className="rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="duration" className="text-sm text-white">
                Takes
              </label>
              <input
                id="duration"
                type="number"
                min={0}
                max={365}
                className="w-16 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none"
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
              />
              <span className="text-sm text-white">days</span>
            </div>
          </div>
        </section>

        {!imagesEnabled && (
          <p className="mb-4 rounded-lg bg-white bg-opacity-15 px-3 py-2 text-sm text-white">
            Image search is off. Add <code>PEXELS_API_KEY</code> to <code>.env</code> and restart to
            illustrate your tasks.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-600 shadow"
          >
            {error}
          </p>
        )}

        {schedule && schedule.criticalPath.length > 0 && (
          <p className="mb-4 text-sm text-white/90">
            Critical path:{' '}
            <span className="font-semibold text-white">
              {schedule.criticalPath.map((id) => titleById.get(id) ?? id).join(' \u2192 ')}
            </span>{' '}
            {'\u2014'} delaying any of these delays everything.
          </p>
        )}

        {schedule && schedule.tasks.length > 0 && (
          <DependencyGraph
            tasks={schedule.tasks}
            edges={edges}
            criticalPath={schedule.criticalPath}
          />
        )}

        {isLoading && <TaskListSkeleton />}

        {!isLoading && todos.length === 0 && (
          <p className="rounded-lg bg-white px-6 py-10 text-center text-sm text-gray-500 shadow-lg">
            No tasks yet. Add your first one above.
          </p>
        )}

        <ul className="space-y-4">
          {todos.map((todo) => {
            const due = todo.dueDate ? getDueStatus(todo.dueDate, now) : null;
            const task = scheduleById.get(todo.id);
            const available = todos.filter(
              (candidate) => candidate.id !== todo.id && !todo.dependencyIds.includes(candidate.id)
            );

            return (
              <li
                key={todo.id}
                className={`rounded-lg bg-white shadow-lg ${
                  task?.missesDueDate ? 'ring-1 ring-red-400' : ''
                }`}
              >
                <div className="flex items-start gap-3 p-4">
                  <TaskImage
                    status={todo.imageStatus}
                    url={todo.imageUrl}
                    alt={todo.imageAlt}
                    credit={todo.imageCredit}
                    title={todo.title}
                  />

                  <div className="flex min-w-0 flex-grow flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium leading-snug text-gray-800">{todo.title}</h3>

                      {task?.isCritical && (
                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-600">
                          critical
                        </span>
                      )}
                    </div>

                    {due && todo.dueDate && (
                      <time
                        dateTime={new Date(todo.dueDate).toISOString().slice(0, 10)}
                        className={`text-sm ${DUE_STATE_CLASS[due.state]}`}
                      >
                        {due.label}
                      </time>
                    )}

                    {task && (
                      <p className="text-xs text-gray-500">
                        {task.durationDays}d estimate {'\u00b7'} can start{' '}
                        {task.earliestStart === 0
                          ? 'now'
                          : formatDueDate(dayOffsetToDate(task.earliestStart, now))}
                        {task.slack > 0 && ` \u00b7 ${task.slack}d slack`}
                      </p>
                    )}

                    {task?.missesDueDate && (
                      <p className="text-xs font-medium text-red-600">
                        Impossible deadline {'\u2014'} earliest finish is{' '}
                        {formatDueDate(dayOffsetToDate(task.earliestFinish, now))}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="shrink-0 rounded-md p-1 text-red-500 transition duration-300 hover:text-red-700"
                    aria-label={`Delete ${todo.title}`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-4 py-2">
                  <span className="text-xs text-gray-400">Depends on</span>

                  {todo.dependencyIds.length === 0 && (
                    <span className="text-xs text-gray-400">nothing</span>
                  )}

                  {todo.dependencyIds.map((dependencyId) => (
                    <span
                      key={dependencyId}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2 pr-1 text-xs text-gray-700"
                    >
                      {titleById.get(dependencyId) ?? `#${dependencyId}`}
                      <button
                        onClick={() => changeDependency(todo.id, dependencyId, 'DELETE')}
                        className="px-1 text-gray-400 hover:text-red-600"
                        aria-label={`Remove dependency ${titleById.get(dependencyId) ?? dependencyId}`}
                      >
                        {'\u00d7'}
                      </button>
                    </span>
                  ))}

                  {available.length > 0 && (
                    <select
                      className="ml-auto rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-600 focus:outline-none"
                      value=""
                      aria-label={`Add a dependency to ${todo.title}`}
                      onChange={(e) => {
                        if (e.target.value) changeDependency(todo.id, Number(e.target.value), 'POST');
                      }}
                    >
                      <option value="">+ add dependency</option>
                      {available.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
