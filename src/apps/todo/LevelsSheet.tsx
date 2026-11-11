import { Flame, Sparkles, Trophy } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import type { TodoType } from '../../lib/types';
import { TODO_TYPES } from '../../lib/util';
import { TYPE_ICON } from './look';
import { levelFloor, rankKey, SIZES, xpFor, type Stats } from './model';
import { useTt } from './strings';

/**
 * How levels work, opened from the level badge: where you stand, how a task's XP is worked out (from the same
 * xpFor / levelFloor the game uses, so the numbers can't drift), the ladder of levels around yours, and what the
 * streak and today's ring mean.
 */
export function LevelsSheet({ open, onClose, stats }: { open: boolean; onClose: () => void; stats: Stats }) {
  const tt = useTt();
  const base = xpFor({ complexity: 0, priority: 0, type: 'achieving' });
  const perSize = xpFor({ complexity: 1, priority: 0, type: 'achieving' }) - base;
  const perPriority = xpFor({ complexity: 0, priority: 1, type: 'achieving' }) - base;
  const bonus = (type: TodoType) => xpFor({ complexity: 0, priority: 0, type }) - base;
  const types = [...TODO_TYPES].sort((a, b) => bonus(b) - bonus(a));
  const example = { complexity: 3, priority: 3, type: 'learning' as TodoType };
  const top = Math.max(stats.level + 3, 6);
  const ladder = Array.from({ length: top }, (_, i) => i + 1);
  const toNext = stats.span - stats.into;

  return (
    <Sheet open={open} onClose={onClose} title={tt('levelsTitle')} wide>
      <div className="todo-levels">
        <section className="todo-lv-now">
          <span className="todo-lv-hex" aria-hidden>
            <small>{tt('lv')}</small>
            {stats.level}
          </span>
          <div className="todo-lv-now-txt">
            <strong>
              {tt('level', { n: stats.level })} · {tt(rankKey(stats.level))}
            </strong>
            <span className="todo-lv-bar" style={{ '--p': stats.span ? stats.into / stats.span : 0 } as React.CSSProperties} />
            <span className="muted small">
              {tt('toNextLevel', { n: toNext, next: stats.level + 1 })} · {tt('totalXp', { n: stats.xp })}
            </span>
          </div>
        </section>

        <section className="todo-sec">
          <h3>
            <Sparkles size={16} aria-hidden /> {tt('howXp')}
          </h3>
          <p className="muted small">{tt('howXpIntro')}</p>
          <ul className="todo-xp-rules">
            <li>
              <span>{tt('xpBase')}</span>
              <b dir="ltr">+{base}</b>
            </li>
            <li>
              <span>{tt('xpSize', { sizes: SIZES.slice(1).join(' · ') })}</span>
              <b dir="ltr">
                +{perSize}…+{perSize * 5}
              </b>
            </li>
            <li>
              <span>{tt('xpPriority')}</span>
              <b dir="ltr">
                +{perPriority}…+{perPriority * 3}
              </b>
            </li>
          </ul>
          <h4 className="todo-lv-sub">{tt('xpTypes')}</h4>
          <ul className="todo-xp-types">
            {types.map((ty) => {
              const Icon = TYPE_ICON[ty];
              return (
                <li key={ty} className={`ty-${ty}`}>
                  <Icon size={15} aria-hidden />
                  <span>{tt(`ty_${ty}`)}</span>
                  <b dir="ltr">{bonus(ty) ? `+${bonus(ty)}` : '–'}</b>
                </li>
              );
            })}
          </ul>
          <p className="todo-lv-example">
            {tt('xpExample', {
              size: SIZES[example.complexity],
              type: tt('ty_learning'),
              sum: `${base} + ${perSize * example.complexity} + ${perPriority * example.priority} + ${bonus(example.type)}`,
              n: xpFor(example),
            })}
          </p>
          <p className="muted small">{tt('xpReopen')}</p>
        </section>

        <section className="todo-sec">
          <h3>
            <Trophy size={16} aria-hidden /> {tt('levelsLadder')}
          </h3>
          <p className="muted small">{tt('levelsLadderIntro')}</p>
          <ol className="todo-ladder">
            {ladder.map((n) => (
              <li key={n} className={n < stats.level ? 'is-past' : n === stats.level ? 'is-now' : undefined}>
                <span className="todo-ladder-n">{n}</span>
                <span className="todo-ladder-name">{tt(rankKey(n))}</span>
                <span className="todo-ladder-xp" dir="ltr">
                  {levelFloor(n).toLocaleString()} XP
                </span>
                {n === stats.level && <span className="todo-ladder-you">{tt('youAreHere')}</span>}
              </li>
            ))}
          </ol>
        </section>

        <section className="todo-sec">
          <h3>
            <Flame size={16} aria-hidden /> {tt('streakTitle')}
          </h3>
          <p className="muted small">{tt('streakHow', { n: stats.streak })}</p>
          <p className="muted small">{tt('ringHow')}</p>
        </section>
      </div>
    </Sheet>
  );
}
