import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDueDateInput } from '@/lib/dates';
import { errorResponse, HttpError, readJsonBody } from '@/lib/http';
import { startImageResolution } from '@/lib/todo-images';
import { parseDurationInput, parseRouteId, parseTitleInput } from '@/lib/validation';

interface Params {
  params: {
    id: string;
  };
}


/**
 * Partial update: only the keys actually present in the body are touched, so
 * ticking a checkbox can't blank a due date the user set in another tab.
 */
export async function PATCH(request: Request, { params }: Params) {
  const id = parseRouteId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await readJsonBody(request);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new HttpError(400, 'Expected a JSON object');
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return errorResponse(error, 'Invalid request body', 'PATCH /todos/[id]');
  }

  const data: Prisma.TodoUpdateInput = {};
  try {
    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') throw new Error('completed must be a boolean');
      data.completed = body.completed;
    }
    if ('title' in body) data.title = parseTitleInput(body.title);
    if ('dueDate' in body) data.dueDate = parseDueDateInput(body.dueDate);
    if ('durationDays' in body) data.durationDays = parseDurationInput(body.durationDays);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    let renamed = false;

    // Every completion rule is checked in the same transaction that writes, for
    // the reason the dependency route does it: reading the blockers and then
    // updating in a separate statement is check-then-write, and two concurrent
    // requests -- one completing this task, one adding an open blocker to it --
    // each see a state their own write invalidates. Both commit, and the result
    // is a finished task sitting on unfinished work.
    const todo = await prisma.$transaction(async (tx) => {
      const existing = await tx.todo.findUnique({ where: { id }, select: { title: true } });
      if (!existing) throw new HttpError(404, 'Todo not found');

      // Finishing work that is still blocked would make the schedule a lie: the
      // dependency says this cannot even start yet. The button is disabled for
      // the same reason, but the rule belongs here, where it cannot be skipped.
      if (data.completed === true) {
        const blockers = await tx.taskDependency.findMany({
          where: { dependentId: id, dependency: { completed: false } },
          select: { dependency: { select: { title: true } } },
        });

        if (blockers.length > 0) {
          const [first] = blockers;
          throw new HttpError(
            409,
            blockers.length === 1
              ? `Blocked by \u201c${first.dependency.title}\u201d \u2014 finish that first.`
              : `Blocked by ${blockers.length} unfinished tasks.`
          );
        }
      }

      // The mirror image: reopening work that something finished on top of would
      // leave a completed task sitting on an unfinished blocker.
      if (data.completed === false) {
        const dependents = await tx.taskDependency.findMany({
          where: { dependencyId: id, dependent: { completed: true } },
          select: { dependent: { select: { title: true } } },
        });

        if (dependents.length > 0) {
          const [first] = dependents;
          throw new HttpError(
            409,
            dependents.length === 1
              ? `\u201c${first.dependent.title}\u201d was finished after this \u2014 reopen that first.`
              : `${dependents.length} finished tasks depend on this \u2014 reopen those first.`
          );
        }
      }

      // A renamed task's photo no longer illustrates it, so the search is re-run
      // in the background exactly as it is on creation.
      renamed = typeof data.title === 'string' && data.title !== existing.title;
      if (renamed) data.imageStatus = 'pending';

      return tx.todo.update({
        where: { id },
        data,
        include: { dependencies: { select: { dependencyId: true } } },
      });
    });

    if (renamed) startImageResolution(todo.id, todo.title);

    const { dependencies, ...rest } = todo;
    return NextResponse.json({
      ...rest,
      dependencyIds: dependencies.map((edge) => edge.dependencyId),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }
    return errorResponse(error, 'Error updating todo', 'PATCH /todos/[id]');
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const id = parseRouteId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    await prisma.todo.delete({
      where: { id },
    });
    return NextResponse.json({ message: 'Todo deleted' }, { status: 200 });
  } catch (error) {
    // P2025: the row is not there. That is a 404, not a server fault -- and it
    // is the expected answer when two tabs delete the same task.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }
    return errorResponse(error, 'Error deleting todo', 'DELETE /todos/[id]');
  }
}
