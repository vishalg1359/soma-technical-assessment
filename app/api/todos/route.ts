import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDueDateInput } from '@/lib/dates';
import { requeueStalledImages, startImageResolution } from '@/lib/todo-images';
import { TodoWithDependencies } from '@/lib/types';
import { parseDurationInput, parseTitleInput } from '@/lib/validation';

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

  const { title: rawTitle, dueDate: rawDueDate, durationDays: rawDuration } = body;

  let title: string;
  let dueDate: Date | null;
  let durationDays: number;
  try {
    title = parseTitleInput(rawTitle);
    dueDate = parseDueDateInput(rawDueDate);
    durationDays = parseDurationInput(rawDuration);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const todo = await prisma.todo.create({
      data: { title, dueDate, durationDays },
    });

    // The task is already saved; its illustration arrives afterwards.
    startImageResolution(todo.id, todo.title);

    return NextResponse.json({ ...todo, dependencyIds: [] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error creating todo' }, { status: 500 });
  }
}
