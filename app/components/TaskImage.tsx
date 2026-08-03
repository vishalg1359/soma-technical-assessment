"use client"
import Image from 'next/image';
import { useState } from 'react';

interface Props {
  status: string;
  url: string | null;
  alt: string | null;
  credit: string | null;
  title: string;
}

const FRAME = 'relative w-28 h-20 shrink-0 rounded-md overflow-hidden';

/** Visible while the server is still searching Pexels for this task. */
function Searching({ title }: { title: string }) {
  return (
    <div
      className={`${FRAME} flex flex-col items-center justify-center gap-1 bg-gray-200 animate-pulse`}
      role="status"
      aria-label={`Finding an image for ${title}`}
    >
      <svg className="w-5 h-5 animate-spin text-gray-600" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      <span className="text-[10px] font-medium text-gray-600">Finding image</span>
    </div>
  );
}

/** Visible when the search finished without a usable photo. */
function NoImage() {
  return (
    <div
      className={`${FRAME} flex flex-col items-center justify-center gap-1 bg-gray-100 border border-dashed border-gray-300 text-gray-400`}
      title="No image available for this task"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 16l5-5 4 4 3-3 6 6M3 5h18v14H3z"
        />
      </svg>
      <span className="text-[10px]">No image</span>
    </div>
  );
}

export default function TaskImage({ status, url, alt, credit, title }: Props) {
  // Two distinct waits: the server finding a photo, then the browser fetching it.
  const [loaded, setLoaded] = useState(false);

  if (status === 'pending' || status === 'resolving') return <Searching title={title} />;
  if (status !== 'ready' || !url) return <NoImage />;

  return (
    <div className={`${FRAME} bg-gray-200`} title={credit ? `Photo by ${credit} on Pexels` : undefined}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-gray-200" aria-hidden />}
      <Image
        src={url}
        alt={alt ?? `Photo illustrating ${title}`}
        fill
        sizes="112px"
        className={`object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
}
