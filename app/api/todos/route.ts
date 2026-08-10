import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDueDateInput } from '@/lib/dates';
import { errorResponse, HttpError, readJsonBody } from '@/lib/http';
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
    return errorResponse(error, 'Error fetching todos', 'GET /todos');
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'Expected a JSON object');
    }

    const { title: rawTitle, dueDate: rawDueDate, durationDays: rawDuration } = body as Record<
      string,
      unknown
    >;

    let title: string;
    let dueDate: Date | null;
    let durationDays: number;
    try {
      title = parseTitleInput(rawTitle);
      dueDate = parseDueDateInput(rawDueDate);
      durationDays = parseDurationInput(rawDuration);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid input');
    }

    const todo = await prisma.todo.create({
      data: { title, dueDate, durationDays },
    });

    // The task is already saved; its illustration arrives afterwards.
    startImageResolution(todo.id, todo.title);

    return NextResponse.json({ ...todo, dependencyIds: [] }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Error creating todo', 'POST /todos');
  }
}
