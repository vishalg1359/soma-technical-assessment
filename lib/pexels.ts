export interface PexelsPhoto {
  url: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
}

export type PhotoLookup =
  | { status: 'ready'; photo: PexelsPhoto }
  | { status: 'unavailable'; reason: string };

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';
const DEFAULT_TIMEOUT_MS = 6000;

/** The slice of `fetch` this module actually uses, so tests can supply a stub. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface SearchOptions {
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

/**
 * Pull a usable photo out of a Pexels search payload. Kept separate from the
 * network call so the shape handling is testable without stubbing HTTP.
 */
export function pickPhoto(payload: unknown): PexelsPhoto | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const photos = (payload as { photos?: unknown }).photos;
  if (!Array.isArray(photos) || photos.length === 0) return null;

  const photo = photos[0] as {
    src?: Record<string, string>;
    alt?: string;
    photographer?: string;
    photographer_url?: string;
  };

  // Prefer the mid-size renditions: `original` is often several megabytes.
  const url = photo.src?.large ?? photo.src?.medium ?? photo.src?.original;
  if (typeof url !== 'string' || url === '') return null;

  return {
    url,
    alt: photo.alt?.trim() || '',
    photographer: photo.photographer ?? '',
    photographerUrl: photo.photographer_url ?? '',
  };
}

/**
 * Look up one illustrative photo for a task title.
 *
 * Never throws: every failure mode (no key, rate limit, timeout, no results)
 * collapses into an `unavailable` result with a reason, because a missing
 * decoration must never take down task creation.
 */
export async function searchPhoto(
  query: string,
  { apiKey = process.env.PEXELS_API_KEY, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }: SearchOptions = {}
): Promise<PhotoLookup> {
  const trimmed = query.trim();
  if (trimmed === '') return { status: 'unavailable', reason: 'Empty search query' };
  if (!apiKey) return { status: 'unavailable', reason: 'PEXELS_API_KEY is not set' };

  const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(trimmed)}&per_page=1&orientation=landscape`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    });

    if (response.status === 401) return { status: 'unavailable', reason: 'Pexels rejected the API key' };
    if (response.status === 429) return { status: 'unavailable', reason: 'Pexels rate limit reached' };
    if (!response.ok) return { status: 'unavailable', reason: `Pexels returned ${response.status}` };

    const photo = pickPhoto(await response.json());
    if (!photo) return { status: 'unavailable', reason: `No photo matched "${trimmed}"` };

    return { status: 'ready', photo };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      status: 'unavailable',
      reason: aborted ? `Pexels timed out after ${timeoutMs}ms` : 'Could not reach Pexels',
    };
  } finally {
    clearTimeout(timer);
  }
}
