"use client"
import { Todo } from '@prisma/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDueStatus } from '@/lib/dates';
import TaskImage from './components/TaskImage';
import TaskListSkeleton from './components/TaskListSkeleton';

const MINUTE_MS = 60 * 1000;
const IMAGE_POLL_MS = 1500;

const DUE_STATE_CLASS = {
  overdue: 'text-red-600 font-semibold',
  today: 'text-amber-600 font-medium',
  upcoming: 'text-gray-500',
} as const;

const isAwaitingImage = (todo: Todo) =>
  todo.imageStatus === 'pending' || todo.imageStatus === 'resolving';

export default function Home() {
  const [newTodo, setNewTodo] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);
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

  const handleAddTodo = async () => {
    if (!newTodo.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo, dueDate: newDueDate || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not add that todo.');
        return;
      }
      setNewTodo('');
      setNewDueDate('');
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
      fetchTodos();
    } catch {
      setError('Could not delete that todo.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500 flex flex-col items-center p-4">
      <div className="w-full max-w-md">
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
            {isAdding ? 'Adding…' : 'Add'}
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2 text-white">
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
          {newDueDate && (
            <button
              onClick={() => setNewDueDate('')}
              className="text-sm underline opacity-80 hover:opacity-100"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-white bg-red-700 bg-opacity-80 rounded p-2">
            {error}
          </p>
        )}

        {!imagesEnabled && (
          <p className="mb-4 text-sm text-white bg-black bg-opacity-20 rounded p-2">
            Image search is off. Add <code>PEXELS_API_KEY</code> to <code>.env</code> and restart to
            illustrate your tasks.
          </p>
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
            return (
              <li
                key={todo.id}
                className="flex items-center gap-3 bg-white bg-opacity-90 p-4 mb-4 rounded-lg shadow-lg"
              >
                <TaskImage
                  status={todo.imageStatus}
                  url={todo.imageUrl}
                  alt={todo.imageAlt}
                  credit={todo.imageCredit}
                  title={todo.title}
                />

                <div className="flex flex-col flex-grow min-w-0">
                  <span className="text-gray-800 break-words">{todo.title}</span>
                  {due && todo.dueDate && (
                    <time
                      dateTime={new Date(todo.dueDate).toISOString().slice(0, 10)}
                      className={`text-sm ${DUE_STATE_CLASS[due.state]}`}
                    >
                      {due.label}
                    </time>
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
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
