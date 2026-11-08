import { ListTodo } from 'lucide-react';
import type { AppManifest } from '../types';
import cover from './cover.svg';

// Placeholder for a future project. To build it: add App.tsx next to this file and remove `status: 'soon'`.
const app: AppManifest = {
  name: { en: 'To-do list', he: 'רשימת משימות' },
  tagline: { en: 'Plan your day', he: 'לתכנן את היום' },
  description: {
    en: 'Keep track of what needs doing and tick things off as you go.',
    he: 'מעקב אחרי מה שצריך לעשות, וסימון משימות שהושלמו.',
  },
  icon: ListTodo,
  image: cover,
  colors: ['#10b981', '#0ea5e9'],
  category: { en: 'Productivity', he: 'פרודוקטיביות' },
  tags: ['tasks', 'lists'],
  status: 'soon',
  order: 10,
};

export default app;
