import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { errorResponse, HttpError, readJsonBody } from '@/lib/http';
import { TaskNode, wouldCreateCycle } from '@/lib/scheduling';
import { parseRouteId } from '@/lib/validation';

interface Context {
  params: { id: string };
}

async function parseIds(request: Request, context: Context) {
  const body = await readJsonBody(request);
  const raw =
    typeof body === 'object' && body !== null
      ? (body as { dependencyId?: unknown }).dependencyId
      : undefined;

  const dependentId = parseRouteId(context.params.id);
  const dependencyId =
    typeof raw === 'number' || typeof raw === 'string' ? parseRouteId(String(raw)) : null;

  if (dependentId === null || dependencyId === null) {
    throw new HttpError(400, 'Task ids must be positive integers');
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
    ({ dependentId, dependencyId } = await parseIds(request, context));
  } catch (error) {
    return errorResponse(error, 'Invalid request body', 'POST /todos/[id]/dependencies');
  }

  if (dependentId === dependencyId) {
    return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Reachability is a property of the edges alone, so only the edges are
      // read -- not every task with every column. The two endpoints are the
      // only rows whose contents matter, and they are fetched by id.
      const [endpoints, edges] = await Promise.all([
        tx.todo.findMany({
          where: { id: { in: [dependentId, dependencyId] } },
          select: { id: true, completed: true },
        }),
        tx.taskDependency.findMany({ select: { dependentId: true, dependencyId: true } }),
      ]);

      const dependent = endpoints.find((todo) => todo.id === dependentId);
      const dependency = endpoints.find((todo) => todo.id === dependencyId);
      if (!dependent || !dependency) {
        throw new HttpError(404, 'Task not found');
      }

      // Completion is gated on blockers being done, so an edge that would put a
      // finished task behind unfinished work has to be refused here too.
      if (dependent.completed && !dependency.completed) {
        throw new HttpError(
          409,
          'That task is already finished — reopen it before adding a blocker'
        );
      }

      const dependenciesOf = new Map<number, number[]>();
      for (const edge of edges) {
        const existing = dependenciesOf.get(edge.dependentId);
        if (existing) existing.push(edge.dependencyId);
        else dependenciesOf.set(edge.dependentId, [edge.dependencyId]);
      }

      // `wouldCreateCycle` only walks `dependencyIds`, so the nodes it needs are
      // the ones that actually have edges; titles and durations are irrelevant.
      const graph: TaskNode[] = Array.from(dependenciesOf, ([id, dependencyIds]) => ({
        id,
        title: '',
        durationDays: 0,
        dependencyIds,
      }));

      if (wouldCreateCycle(graph, dependentId, dependencyId)) {
        throw new HttpError(409, 'That would create a circular dependency');
      }

      await tx.taskDependency.create({ data: { dependentId, dependencyId } });
    });
  } catch (error) {
    // Unique constraint: the edge already exists, so the caller's intent holds.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    return errorResponse(error, 'Could not add dependency', 'POST /todos/[id]/dependencies');
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, context: Context) {
  let dependentId: number;
  let dependencyId: number;

  try {
    ({ dependentId, dependencyId } = await parseIds(request, context));
  } catch (error) {
    return errorResponse(error, 'Invalid request body', 'DELETE /todos/[id]/dependencies');
  }

  try {
    await prisma.taskDependency.deleteMany({ where: { dependentId, dependencyId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 'Could not remove dependency', 'DELETE /todos/[id]/dependencies');
  }
}
