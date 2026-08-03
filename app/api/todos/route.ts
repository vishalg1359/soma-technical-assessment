import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDueDateInput } from '@/lib/dates';
import { requeueStalledImages, startImageResolution } from '@/lib/todo-images';
import { TodoWithDependencies } from '@/lib/types';

const MAX_DURATION_DAYS = 365;

function parseDurationInput(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1;

  const duration = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(duration)) throw new Error('Duration must be a whole number of days');
  if (duration < 0) throw new Error('Duration cannot be negative');
  if (duration > MAX_DURATION_DAYS) throw new Error(`Duration cannot exceed ${MAX_DURATION_DAYS} days`);

  return duration;
}

export async function GET() {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: { createdAt: 'desc' },
      include: { dependencies: { select: { dependencyId: true } } },
    });

    // Pick up any image work this process lost to a restart. Deliberately not
    // awaited: the list must not wait on Pexels.
    void requeueStalledImages().catch((error) => console.error('[images] sweep failed', error));

    const payload: TodoWithDependencies[] = todos.map(({ dependencies, ...todo }) => ({
      ...todo,
      dependencyIds: dependencies.map((edge) => edge.dependencyId),
    }));

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching todos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { title?: unknown; dueDate?: unknown; durationDays?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { title, dueDate: rawDueDate, durationDays: rawDuration } = body;
  if (typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  let dueDate: Date | null;
  let durationDays: number;
  try {
    dueDate = parseDueDateInput(rawDueDate);
    durationDays = parseDurationInput(rawDuration);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const todo = await prisma.todo.create({
      data: { title: title.trim(), dueDate, durationDays },
    });

    // The task is already saved; its illustration arrives afterwards.
    startImageResolution(todo.id, todo.title);

    return NextResponse.json({ ...todo, dependencyIds: [] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error creating todo' }, { status: 500 });
  }
}