"use client"
import Image from 'next/image';
import { useState } from 'react';

interface Props {
  status: string;
  url: string | null;
  alt: string | null;
  credit: string | null;
  title: string;
  /** A row shows a thumbnail; an opened task shows the photo properly. */
  variant?: 'thumb' | 'banner';
}

const FRAMES = {
  banner: 'relative w-full h-56 sm:h-72 border-b border-[var(--border)] overflow-hidden',
  thumb: 'relative h-11 w-16 shrink-0 overflow-hidden rounded-md',
} as const;

/** Visible while the server is still searching Pexels for this task. */
function Searching({ title, variant }: { title: string; variant: 'thumb' | 'banner' }) {
  return (
    <div
      className={`${FRAMES[variant]} flex flex-col items-center justify-center gap-2 bg-[var(--surface-2)]`}
      role="status"
      aria-label={`Finding an image for ${title}`}
    >
      <svg
        className={`animate-spin text-[var(--ink-3)] ${variant === 'thumb' ? 'h-3 w-3' : 'h-5 w-5'}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {variant === 'banner' && (
        <span className="text-[11px] text-[var(--ink-3)]">Finding an image</span>
      )}
    </div>
  );
}

export default function TaskImage({ status, url, alt, credit, title, variant = 'banner' }: Props) {
  // Two distinct waits: the server finding a photo, then the browser fetching it.
  const [loaded, setLoaded] = useState(false);

  if (status === 'pending' || status === 'resolving') {
    return <Searching title={title} variant={variant} />;
  }
  // Nothing found: the card reads fine without a photo, and an empty frame on
  // every task would be worse than none.
  if (status !== 'ready' || !url) return null;

  return (
    <div
      className={`${FRAMES[variant]} bg-[var(--surface-2)]`}
      title={credit ? `Photo by ${credit} on Pexels` : undefined}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-[var(--surface-2)]" aria-hidden />
      )}
      {variant === 'banner' && (
        // The same photo, blown up and blurred, fills the letterboxing so an
        // opened task never shows bare grey bars.
        <Image
          src={url}
          alt=""
          aria-hidden
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="scale-110 object-cover opacity-30 blur-2xl"
        />
      )}
      <Image
        src={url}
        alt={alt ?? `Photo illustrating ${title}`}
        fill
        sizes={variant === 'thumb' ? '64px' : '(max-width: 768px) 100vw, 768px'}
        className={`transition-opacity duration-500 ${
          // A thumbnail is a swatch, so it crops; an opened task shows the whole
          // photo rather than an arbitrary centre slice of it.
          variant === 'thumb' ? 'object-cover' : 'object-contain'
        } ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
      {variant === 'banner' && credit && (
        <span className="absolute bottom-1.5 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/80">
          Photo by {credit} on Pexels
        </span>
      )}
    </div>
  );
}
