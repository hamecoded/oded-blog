import { useEffect, useState, type RefObject } from 'react';

// Hooks for landing pages (the default one and any custom one in src/landings).

/**
 * Index of the `[data-bg]` section currently in the middle of the screen, inside `root`.
 * Drives which background image the ParallaxBackdrop shows.
 */
export function useActiveSection(root: RefObject<HTMLElement | null>, deps: unknown[] = []): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sections = [...el.querySelectorAll<HTMLElement>('[data-bg]')];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.bg) || 0);
      },
      // A thin band across the middle of the viewport: whichever section crosses it is "current".
      { rootMargin: '-45% 0px -45% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return active;
}

/** True once the page has scrolled past `px` (the landing header turns solid). */
export function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => setPast(window.scrollY > px);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [px]);
  return past;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
