import { useEffect, useRef } from 'react';
import type { Fx } from './fx';

/** The full-screen canvas the celebration effects draw on. It never takes taps. */
export function FxLayer({ fx, reduced, font }: { fx: Fx; reduced: boolean; font: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    fx.attach(ref.current);
    return () => fx.attach(null);
  }, [fx]);
  useEffect(() => {
    fx.configure(reduced, font);
  }, [fx, reduced, font]);
  return <canvas ref={ref} className="todo-fx" aria-hidden />;
}
