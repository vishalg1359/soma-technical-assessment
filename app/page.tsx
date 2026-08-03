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

  const titleById = useMemo(
    () => new Map(todos.map((todo) => [todo.id, todo.title])),
    [todos]
  );

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
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500 flex flex-col items-center p-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-4xl font-bold text-center text-white mb-8">Things To Do App</h1>

        <div className="flex mb-2">
          <input
            type="text"
            className="flex-grow p-3 rounded-l-full focus:outline-none text-gray-700"
            placeholder="Add a new todo"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
          />
          <button
            onClick={handleAddTodo}
            disabled={isAdding || !newTodo.trim()}
            className="bg-white text-indigo-600 p-3 rounded-r-full hover:bg-gray-100 transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed min-w-[5rem]"
          >
            {isAdding ? 'Adding\u2026' : 'Add'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-2 text-white">
          <label htmlFor="due-date" className="text-sm">
            Due date
          </label>
          <input
            id="due-date"
            type="date"
            className="p-2 rounded text-gray-700"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
          <label htmlFor="duration" className="text-sm">
            Takes
          </label>
          <input
            id="duration"
            type="number"
            min={0}
            max={365}
            className="p-2 rounded text-gray-700 w-20"
            value={newDuration}
            onChange={(e) => setNewDuration(e.target.value)}
          />
          <span className="text-sm">days</span>
          {newDueDate && (
            <button
              onClick={() => setNewDueDate('')}
              className="text-sm underline opacity-80 hover:opacity-100"
            >
              Clear date
            </button>
          )}
        </div>

        {!imagesEnabled && (
          <p className="mb-4 text-sm text-white bg-black bg-opacity-20 rounded p-2">
            Image search is off. Add <code>PEXELS_API_KEY</code> to <code>.env</code> and restart to
            illustrate your tasks.
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-white bg-red-700 bg-opacity-80 rounded p-2">
            {error}
          </p>
        )}

        {schedule && schedule.tasks.length > 0 && (
          <>
            <p className="text-white text-sm mb-2">
              Finishing everything takes <strong>{schedule.projectDuration} days</strong>. The
              critical path is{' '}
              <strong>
                {schedule.criticalPath.map((id) => titleById.get(id) ?? id).join(' \u2192 ')}
              </strong>
              .
            </p>
            <DependencyGraph
              tasks={schedule.tasks}
              edges={edges}
              criticalPath={schedule.criticalPath}
            />
          </>
        )}

        {isLoading && <TaskListSkeleton />}

        {!isLoading && todos.length === 0 && (
          <p className="text-center text-white text-opacity-90 bg-white bg-opacity-10 rounded-lg p-6 mt-4">
            Nothing to do yet. Add your first task above.
          </p>
        )}

        <ul className="mt-4">
          {todos.map((todo) => {
            const due = todo.dueDate ? getDueStatus(todo.dueDate, now) : null;
            const task = scheduleById.get(todo.id);
            const available = todos.filter(
              (candidate) =>
                candidate.id !== todo.id && !todo.dependencyIds.includes(candidate.id)
            );

            return (
              <li key={todo.id} className="bg-white bg-opacity-90 p-4 mb-4 rounded-lg shadow-lg">
                <div className="flex items-center gap-3">
                  <TaskImage
                    status={todo.imageStatus}
                    url={todo.imageUrl}
                    alt={todo.imageAlt}
                    credit={todo.imageCredit}
                    title={todo.title}
                  />

                  <div className="flex flex-col flex-grow min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-800 break-words">{todo.title}</span>
                      {task?.isCritical && (
                        <span className="text-[10px] uppercase tracking-wide bg-red-100 text-red-700 rounded px-1.5 py-0.5">
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
                      <span className="text-xs text-gray-500">
                        Takes {task.durationDays}d {'\u00b7'} can start{' '}
                        {task.earliestStart === 0
                          ? 'now'
                          : formatDueDate(dayOffsetToDate(task.earliestStart, now))}
                        {task.slack > 0 && ` \u00b7 ${task.slack}d slack`}
                      </span>
                    )}

                    {task?.missesDueDate && (
                      <span className="text-xs text-red-600 font-medium">
                        Cannot finish by its due date: earliest finish is{' '}
                        {formatDueDate(dayOffsetToDate(task.earliestFinish, now))}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="text-red-500 hover:text-red-700 transition duration-300 shrink-0"
                    aria-label={`Delete ${todo.title}`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                  <span className="text-xs text-gray-500">Depends on</span>

                  {todo.dependencyIds.length === 0 && (
                    <span className="text-xs text-gray-400">nothing</span>
                  )}

                  {todo.dependencyIds.map((dependencyId) => (
                    <span
                      key={dependencyId}
                      className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-full pl-2 pr-1 py-0.5"
                    >
                      {titleById.get(dependencyId) ?? `#${dependencyId}`}
                      <button
                        onClick={() => changeDependency(todo.id, dependencyId, 'DELETE')}
                        className="text-gray-400 hover:text-red-600 px-1"
                        aria-label={`Remove dependency ${titleById.get(dependencyId) ?? dependencyId}`}
                      >
                        {'\u00d7'}
                      </button>
                    </span>
                  ))}

                  {available.length > 0 && (
                    <select
                      className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-700 ml-auto"
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
    </div>
  );
}
