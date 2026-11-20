import {
  Ban,
  CircleCheckBig,
  Compass,
  Gem,
  ListChecks,
  Route,
  Scale,
  Sparkles,
  Crosshair,
  GraduationCap,
  Lightbulb,
  Lock,
  Pause,
  Play,
  Search,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { TodoStatus, TodoType } from '../../lib/types';

/** One icon per stage. Colours live in index.css as --st-<status> / --ty-<type> (canvas reads them too). */
export const STATUS_ICON: Record<TodoStatus, LucideIcon> = {
  discovered: Compass,
  researched: Search,
  defined: Crosshair,
  inprogress: Play,
  completed: CircleCheckBig,
  blocked: Lock,
  onhold: Pause,
  quit: Ban,
};

export const TYPE_ICON: Record<TodoType, LucideIcon> = {
  achieving: Trophy,
  learning: GraduationCap,
  understanding: Lightbulb,
  decisions: Scale,
  checking: ListChecks,
  opportunities: Sparkles,
  enrichments: Gem,
  planning: Route,
};

/**
 * A tag's own hue (0–359), the same for the same name in any letter case: each topic in the Tags tab keeps one
 * colour, so it's recognised at a glance.
 */
export function tagHue(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) % 3600;
  return Math.round(h / 10) % 360;
}
