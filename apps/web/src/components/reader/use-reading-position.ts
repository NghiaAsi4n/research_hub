'use client';

import type { ReadingPosition } from '@research-hub/core/reader';
import { useEffect, useState } from 'react';

export function useReadingPosition(id: string, initial: ReadingPosition | null) {
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: ReadingPosition | undefined;
    let saving = false;
    let last = '';
    let restored = false;
    const frame = requestAnimationFrame(() => {
      const anchor = window.location.hash.slice(1);
      if (anchor) document.getElementById(anchor)?.scrollIntoView();
      else if (initial && initial.ratio > 0)
        window.scrollTo(
          0,
          initial.ratio * Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        );
      else if (initial?.section) document.getElementById(initial.section)?.scrollIntoView();
      restored = true;
    });
    const capture = (): ReadingPosition => {
      const headings = [
        ...document.querySelectorAll<HTMLElement>('.reader-content :is(h1,h2,h3,h4,h5,h6)[id]'),
      ];
      const section =
        headings.filter((h) => h.getBoundingClientRect().top <= 100).at(-1)?.id ?? null;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      return { section, ratio: height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0 };
    };
    const save = async () => {
      if (saving || !pending) return;
      saving = true;
      const position = pending;
      pending = undefined;
      try {
        const response = await fetch(`/api/documents/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(position),
          keepalive: true,
        });
        if (!response.ok) throw new Error('save_failed');
        setSaveError(false);
      } catch {
        setSaveError(true);
      } finally {
        saving = false;
        if (pending) void save();
      }
    };
    const scroll = () => {
      if (!restored) return;
      const position = capture();
      const serialized = JSON.stringify(position);
      if (serialized === last) return;
      last = serialized;
      pending = position;
      clearTimeout(timer);
      timer = setTimeout(() => void save(), 1200);
    };
    const flush = () => {
      clearTimeout(timer);
      void save();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      flush();
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [id, initial]);
  return saveError;
}
