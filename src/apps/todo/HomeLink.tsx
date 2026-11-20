import type { CSSProperties } from 'react';
import manifest from './app';
import { useTt } from './strings';

/**
 * The app's own icon, in the corner the level badge used to hold: tapping it goes to Today (the app's start), from
 * any tab or open journey, event or topic. The way back to the Apps page is the blog's own menu.
 */
export function HomeLink({ onHome }: { onHome: () => void }) {
  const tt = useTt();
  const Icon = typeof manifest.icon === 'string' ? null : manifest.icon;
  const style = manifest.colors ? ({ '--app-c1': manifest.colors[0], '--app-c2': manifest.colors[1] } as CSSProperties) : undefined;
  return (
    <button type="button" className="todo-home" style={style} onClick={onHome} aria-label={tt('homeToday')} data-tip={tt('homeToday')}>
      {Icon ? <Icon size={22} strokeWidth={2.2} aria-hidden /> : <img src={manifest.icon as string} alt="" />}
    </button>
  );
}
