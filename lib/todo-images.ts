import { prisma } from './prisma';
import { searchPhoto } from './pexels';

export const IMAGE_STATUS = {
  pending: 'pending',
  resolving: 'resolving',
  ready: 'ready',
  unavailable: 'unavailable',
} as const;

export type ImageStatus = (typeof IMAGE_STATUS)[keyof typeof IMAGE_STATUS];

/** How long a `resolving` row may sit before we assume its worker died. */
const STALE_AFTER_MS = 30_000;

/**
 * How often the sweep may actually touch the database.
 *
 * The list endpoint calls it on every read, and the client polls that endpoint
 * every 1.5s while any image is outstanding -- so without a gate, reading the
 * list is a write, forty times a minute per open tab. Nothing here is urgent:
 * the work being reclaimed is already at least `STALE_AFTER_MS` old.
 */
const SWEEP_INTERVAL_MS = 15_000;

/** How many stalled rows one sweep will pick up. */
const SWEEP_BATCH = 10;

let lastSweep = 0;

/**
 * Resolve one task's illustration.
 *
 * The row is claimed with a conditional `updateMany` before any network call:
 * that compare-and-set is what stops two concurrent callers (a duplicate submit,
 * or a poll racing the create) from both spending a Pexels request on the same
 * task. If the claim matches zero rows, someone else already owns it.
 */
export async function resolveTodoImage(todoId: number, query: string): Promise<void> {
  const claim = await prisma.todo.updateMany({
    where: { id: todoId, imageStatus: { in: [IMAGE_STATUS.pending] } },
    data: { imageStatus: IMAGE_STATUS.resolving, imageCheckedAt: new Date() },
  });
  if (claim.count === 0) return;

  const lookup = await searchPhoto(query);

  if (lookup.status === 'ready') {
    await prisma.todo.update({
      where: { id: todoId },
      data: {
        imageStatus: IMAGE_STATUS.ready,
        imageUrl: lookup.photo.url,
        imageAlt: lookup.photo.alt || `Photo illustrating "${query}"`,
        imageCredit: lookup.photo.photographer || null,
        imageCheckedAt: new Date(),
      },
    });
    return;
  }

  console.warn(`[images] todo ${todoId}: ${lookup.reason}`);
  await prisma.todo.update({
    where: { id: todoId },
    data: { imageStatus: IMAGE_STATUS.unavailable, imageCheckedAt: new Date() },
  });
}

/**
 * Kick off resolution without blocking the caller. Task creation returns as soon
 * as the row exists; the picture catches up.
 */
export function startImageResolution(todoId: number, query: string): void {
  void resolveTodoImage(todoId, query).catch((error) => {
    console.error(`[images] todo ${todoId} failed`, error);
  });
}

/**
 * Reconcile work the process lost.
 *
 * Fire-and-forget only survives as long as the process does: a restart mid-fetch
 * strands a row in `resolving` forever, and rows created before this feature
 * existed start life as `pending` with nobody assigned. Rather than a queue, the
 * list endpoint sweeps for both on each read -- eventually consistent, and it
 * costs one indexed query.
 */
export async function requeueStalledImages(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  const cutoff = new Date(now - STALE_AFTER_MS);

  await prisma.todo.updateMany({
    where: { imageStatus: IMAGE_STATUS.resolving, imageCheckedAt: { lt: cutoff } },
    data: { imageStatus: IMAGE_STATUS.pending },
  });

  const waiting = await prisma.todo.findMany({
    where: { imageStatus: IMAGE_STATUS.pending },
    select: { id: true, title: true },
    take: SWEEP_BATCH,
  });

  for (const todo of waiting) {
    startImageResolution(todo.id, todo.title);
  }

  // A silent cap reads as "nothing left to do". Say when there is more, so a
  // backlog shows up in the log instead of looking like a stuck queue.
  if (waiting.length === SWEEP_BATCH) {
    console.warn(`[images] swept ${SWEEP_BATCH} stalled tasks; more remain for the next sweep`);
  }
}
