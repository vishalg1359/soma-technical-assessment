import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TaskNode, wouldCreateCycle } from '@/lib/scheduling';

interface Context {
  params: { id: string };
}

function parseIds(context: Context, raw: unknown) {
  const dependentId = Number(context.params.id);
  const dependencyId = Number(raw);

  if (!Number.isInteger(dependentId) || !Number.isInteger(dependencyId)) {
    throw new Error('Task ids must be integers');
  }
  return { dependentId, dependencyId };
}

/**
 * Add `dependencyId` as a prerequisite of `id`.
 *
 * The cycle check and the insert run in one transaction. Doing the check first
 * and writing afterwards is a classic time-of-check/time-of-use bug: two
 * concurrent requests can each read an acyclic graph, each conclude their edge
 * is safe, and together close a loop. Reading the edges inside the transaction
 * that writes closes that window.
 */
export async function POST(request: Request, context: Context) {
  let dependentId: number;
  let dependencyId: number;

  try {
    const body = await request.json();
    ({ dependentId, dependencyId } = parseIds(context, body?.dependencyId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (dependentId === dependencyId) {
    return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const todos = await tx.todo.findMany({
        select: { id: true, title: true, durationDays: true, dependencies: { select: { dependencyId: true } } },
      });

      const known = new Set(todos.map((todo) => todo.id));
      if (!known.has(dependentId) || !known.has(dependencyId)) {
        throw new Error('NOT_FOUND');
      }

      const graph: TaskNode[] = todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        durationDays: todo.durationDays,
        dependencyIds: todo.dependencies.map((edge) => edge.dependencyId),
      }));

      if (wouldCreateCycle(graph, dependentId, dependencyId)) {
        throw new Error('CYCLE');
      }

      await tx.taskDependency.create({ data: { dependentId, dependencyId } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'CYCLE') {
      return NextResponse.json(
        { error: 'That would create a circular dependency' },
        { status: 409 }
      );
    }
    // Unique constraint: the edge already exists, so the caller's intent holds.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    return NextResponse.json({ error: 'Could not add dependency' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, context: Context) {
  let dependentId: number;
  let dependencyId: number;

  try {
    const body = await request.json();
    ({ dependentId, dependencyId } = parseIds(context, body?.dependencyId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await prisma.taskDependency.deleteMany({ where: { dependentId, dependencyId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Could not remove dependency' }, { status: 500 });
  }
}