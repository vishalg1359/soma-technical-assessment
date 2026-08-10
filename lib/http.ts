import { NextResponse } from 'next/server';

/** A refusal carrying the status it deserves. Thrown anywhere, answered once. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Read a JSON request body, enforcing the content type rather than assuming it.
 *
 * A page on another origin can POST `text/plain` without tripping a CORS
 * preflight -- it is a "simple request" -- so a handler that parses whatever
 * arrives will happily take writes from someone else's site. Demanding
 * `application/json` forces the preflight, which that page cannot satisfy.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const mediaType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new HttpError(415, 'Expected Content-Type: application/json');
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid request body');
  }
}

/**
 * Turn a thrown error into a response.
 *
 * Deliberate refusals keep their status and message; anything else is a bug, so
 * it is logged server-side and the caller gets a flat 500. An unexpected error
 * that reaches a user should never carry a stack trace or a driver message.
 */
export function errorResponse(error: unknown, fallback: string, context: string) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[api] ${context}`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
