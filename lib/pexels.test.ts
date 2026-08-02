import { describe, expect, it, vi } from 'vitest';
import { pickPhoto, searchPhoto } from './pexels';

const photoPayload = {
  photos: [
    {
      src: { original: 'orig.jpg', large: 'large.jpg', medium: 'medium.jpg' },
      alt: '  A tidy desk  ',
      photographer: 'Ada Lovelace',
      photographer_url: 'https://pexels.com/@ada',
    },
  ],
};

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('pickPhoto', () => {
  it('prefers the large rendition over the multi-megabyte original', () => {
    expect(pickPhoto(photoPayload)?.url).toBe('large.jpg');
  });

  it('falls back through medium to original', () => {
    expect(pickPhoto({ photos: [{ src: { medium: 'm.jpg', original: 'o.jpg' } }] })?.url).toBe('m.jpg');
    expect(pickPhoto({ photos: [{ src: { original: 'o.jpg' } }] })?.url).toBe('o.jpg');
  });

  it('trims alt text and keeps attribution', () => {
    const photo = pickPhoto(photoPayload);
    expect(photo?.alt).toBe('A tidy desk');
    expect(photo?.photographer).toBe('Ada Lovelace');
  });

  it('returns null for empty, malformed, or unusable payloads', () => {
    expect(pickPhoto({ photos: [] })).toBeNull();
    expect(pickPhoto({ photos: [{ src: {} }] })).toBeNull();
    expect(pickPhoto({})).toBeNull();
    expect(pickPhoto(null)).toBeNull();
    expect(pickPhoto('nope')).toBeNull();
  });
});

describe('searchPhoto', () => {
  it('returns a photo on success and asks for a single landscape result', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(photoPayload));
    const result = await searchPhoto('clean the desk', { apiKey: 'key', fetchImpl });

    expect(result).toEqual({
      status: 'ready',
      photo: {
        url: 'large.jpg',
        alt: 'A tidy desk',
        photographer: 'Ada Lovelace',
        photographerUrl: 'https://pexels.com/@ada',
      },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('query=clean%20the%20desk');
    expect(url).toContain('per_page=1');
    expect((init?.headers as Record<string, string>).Authorization).toBe('key');
  });

  it('never calls the network without an API key', async () => {
    const fetchImpl = vi.fn();
    const result = await searchPhoto('anything', { apiKey: undefined, fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'unavailable', reason: 'PEXELS_API_KEY is not set' });
  });

  it.each([
    [401, 'Pexels rejected the API key'],
    [429, 'Pexels rate limit reached'],
    [503, 'Pexels returned 503'],
  ])('degrades gracefully on HTTP %i', async (status, reason) => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, status));
    expect(await searchPhoto('desk', { apiKey: 'key', fetchImpl })).toEqual({
      status: 'unavailable',
      reason,
    });
  });

  it('reports when nothing matched', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ photos: [] }));
    expect(await searchPhoto('asdfqwer', { apiKey: 'key', fetchImpl })).toEqual({
      status: 'unavailable',
      reason: 'No photo matched "asdfqwer"',
    });
  });

  it('swallows network errors rather than failing task creation', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await searchPhoto('desk', { apiKey: 'key', fetchImpl })).toEqual({
      status: 'unavailable',
      reason: 'Could not reach Pexels',
    });
  });

  it('aborts a hanging request instead of waiting forever', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit): Promise<Response> =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );

    const result = await searchPhoto('desk', { apiKey: 'key', fetchImpl, timeoutMs: 10 });
    expect(result).toEqual({ status: 'unavailable', reason: 'Pexels timed out after 10ms' });
  });
});
