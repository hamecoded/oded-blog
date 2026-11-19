import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import manifest from './app';
import { useTt } from './strings';

/**
 * The app's own icon, in the corner the level badge used to hold: tapping it goes back to the Apps page. It takes
 * the place of the blog's "← Apps" header row, which the to-do app hides to give the screen to the game.
 */
export function HomeLink() {
  const tt = useTt();
  const Icon = typeof manifest.icon === 'string' ? null : manifest.icon;
  const style = manifest.colors ? ({ '--app-c1': manifest.colors[0], '--app-c2': manifest.colors[1] } as CSSProperties) : undefined;
  return (
    <Link to="/apps" className="todo-home" style={style} aria-label={tt('backToApps')} data-tip={tt('backToApps')}>
      {Icon ? <Icon size={22} strokeWidth={2.2} aria-hidden /> : <img src={manifest.icon as string} alt="" />}
    </Link>
  );
}
