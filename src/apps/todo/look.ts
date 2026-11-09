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
