#!/usr/bin/env node
/**
 * Concurrency checks against a running server.
 *
 * The unit tests cover the scheduling logic as pure functions. They cannot
 * cover the thing that actually breaks a dependency graph: two requests
 * arriving at once, each reading a state the other is about to invalidate.
 * Every invariant this app claims to enforce is asserted here by firing the
 * requests that would break it, concurrently, many times over.
 *
 *   npm run dev
 *   npm run test:concurrency
 *
 * Exits non-zero on the first violated invariant.
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ROUNDS = Number(process.env.ROUNDS ?? 40);

const api = (method, path, body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const json = async (method, path, body) => (await api(method, path, body)).json();
const list = () => json('GET', '/api/todos');
const create = (title) => json('POST', '/api/todos', { title });
const remove = (id) => api('DELETE', `/api/todos/${id}`);
const addEdge = (dependentId, dependencyId) =>
  api('POST', `/api/todos/${dependentId}/dependencies`, { dependencyId });

const results = [];
function record(name, detail, ok) {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

/**
 * Two requests race to close a loop: A depends on B, B depends on A, fired
 * together. Each cycle check must see the other's edge or be serialised behind
 * it; exactly one edge may survive.
 */
async function noCycleUnderRace() {
  let cycles = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const a = await create(`race-cycle-a-${round}`);
    const b = await create(`race-cycle-b-${round}`);

    await Promise.all([addEdge(a.id, b.id), addEdge(b.id, a.id)]);

    const todos = await list();
    const A = todos.find((todo) => todo.id === a.id);
    const B = todos.find((todo) => todo.id === b.id);
    if (A?.dependencyIds.includes(b.id) && B?.dependencyIds.includes(a.id)) cycles++;

    await remove(a.id);
    await remove(b.id);
  }
  record('no cycle survives a concurrent A→B / B→A', `${cycles}/${ROUNDS} rounds cyclic`, cycles === 0);
}

/**
 * The check-then-write that the cycle guard exists to prevent, in the other
 * direction: complete a task at the same moment an open blocker is added to it.
 * A finished task must never end up sitting on unfinished work.
 */
async function noCompletedTaskOnOpenBlocker() {
  let broken = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const blocker = await create(`race-blocker-${round}`);
    const task = await create(`race-task-${round}`);

    await Promise.all([
      api('PATCH', `/api/todos/${task.id}`, { completed: true }),
      addEdge(task.id, blocker.id),
    ]);

    const todos = await list();
    const B = todos.find((todo) => todo.id === blocker.id);
    const T = todos.find((todo) => todo.id === task.id);
    if (T?.completed && T.dependencyIds.includes(blocker.id) && B && !B.completed) broken++;

    await remove(blocker.id);
    await remove(task.id);
  }
  record(
    'no completed task is left on an unfinished blocker',
    `${broken}/${ROUNDS} rounds broken`,
    broken === 0
  );
}

/**
 * Deleting a task cascades away the edges pointing at it as well as the ones
 * leaving it. Undo has to rebuild both, or it hands back a task that no longer
 * blocks anything and quietly moves the critical path.
 */
async function undoRestoresBothDirections() {
  for (const completed of [false, true]) {
    const upstream = await create('undo-upstream');
    const target = await create('undo-target');
    const downstreamA = await create('undo-downstream-a');
    const downstreamB = await create('undo-downstream-b');

    await addEdge(target.id, upstream.id);
    await addEdge(downstreamA.id, target.id);
    await addEdge(downstreamB.id, target.id);
    if (completed) {
      for (const id of [upstream.id, target.id, downstreamA.id, downstreamB.id]) {
        await api('PATCH', `/api/todos/${id}`, { completed: true });
      }
    }

    const before = await list();
    const removed = before.find((todo) => todo.id === target.id);
    const dependentIds = before
      .filter((todo) => todo.dependencyIds.includes(target.id))
      .map((todo) => todo.id);

    await remove(target.id);

    // The same sequence useTodos.restore performs.
    const recreated = await json('POST', '/api/todos', {
      title: removed.title,
      dueDate: null,
      durationDays: removed.durationDays,
    });
    for (const dependencyId of removed.dependencyIds) await addEdge(recreated.id, dependencyId);
    if (removed.completed) await api('PATCH', `/api/todos/${recreated.id}`, { completed: true });
    for (const dependentId of dependentIds) await addEdge(dependentId, recreated.id);

    const after = await list();
    const T = after.find((todo) => todo.id === recreated.id);
    const A = after.find((todo) => todo.id === downstreamA.id);
    const B = after.find((todo) => todo.id === downstreamB.id);
    const ok =
      T.dependencyIds.includes(upstream.id) &&
      A.dependencyIds.includes(recreated.id) &&
      B.dependencyIds.includes(recreated.id) &&
      T.completed === removed.completed;

    record(
      `undo rebuilds the graph both ways (completed=${completed})`,
      ok ? 'upstream and both dependents restored' : 'edges lost',
      ok
    );

    for (const id of [upstream.id, recreated.id, downstreamA.id, downstreamB.id]) await remove(id);
  }
}

/**
 * A page on another origin can send `text/plain` without a CORS preflight. If
 * the API parses it anyway, any site the user visits can write to their list.
 */
async function rejectsCrossOriginSimpleRequests() {
  const response = await fetch(`${BASE}/api/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ title: 'cross-origin-write' }),
  });
  const rejected = response.status === 415;
  if (!rejected) {
    const created = await response.json().catch(() => null);
    if (created?.id) await remove(created.id);
  }
  record(
    'a non-JSON content type cannot write',
    `text/plain POST answered ${response.status}`,
    rejected
  );
}

async function main() {
  try {
    const probe = await fetch(`${BASE}/api/todos`);
    if (!probe.ok) throw new Error(String(probe.status));
  } catch {
    console.error(`Could not reach ${BASE}. Start the app first:  npm run dev`);
    process.exit(2);
  }

  console.log(`\nConcurrency checks against ${BASE} (${ROUNDS} rounds each)\n`);
  await noCycleUnderRace();
  await noCompletedTaskOnOpenBlocker();
  await undoRestoresBothDirections();
  await rejectsCrossOriginSimpleRequests();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} invariants held\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
