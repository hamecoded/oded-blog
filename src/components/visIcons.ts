import { Globe, Lock, UserCheck, Users } from 'lucide-react';
import type { Visibility } from '../lib/types';

export const VIS_ICON: Record<Visibility, typeof Globe> = { public: Globe, members: UserCheck, private: Lock, restricted: Users };
