import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDueDateInput } from '@/lib/dates';
import { requeueStalledImages, startImageResolution } from '@/lib/todo-images';

export async function GET() {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Pick up any image work this process lost to a restart. Deliberately not
    // awaited: the list must not wait on Pexels.
    void requeueStalledImages().catch((error) => console.error('[images] sweep failed', error));

    return NextResponse.json(todos);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching todos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { title?: unknown; dueDate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { title, dueDate: rawDueDate } = body;
  if (typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  let dueDate: Date | null;
  try {
    dueDate = parseDueDateInput(rawDueDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid due date';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const todo = await prisma.todo.create({
      data: { title: title.trim(), dueDate },
    });

    // The task is already saved; its illustration arrives afterwards.
    startImageResolution(todo.id, todo.title);

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error creating todo' }, { status: 500 });
  }
}