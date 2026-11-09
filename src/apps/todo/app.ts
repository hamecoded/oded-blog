import { ListTodo } from 'lucide-react';
import type { AppManifest } from '../types';
import cover from './cover.svg';

const app: AppManifest = {
  name: { en: 'To-do list', he: 'רשימת משימות' },
  tagline: { en: 'A fresh list every day', he: 'רשימה חדשה בכל יום' },
  description: {
    en: 'A clean list every morning, a pool with reminders for the rest, and big purposes played as quests of steps and actions. Earn XP, level up, keep the streak.',
    he: 'רשימה נקייה בכל בוקר, מאגר עם תזכורות לכל השאר, ומטרות גדולות שמשחקים כמסעות של שלבים ופעולות. צוברים נקודות, עולים רמה ושומרים על הרצף.',
  },
  icon: ListTodo,
  image: cover,
  colors: ['#10b981', '#0ea5e9'],
  category: { en: 'Productivity', he: 'פרודוקטיביות' },
  tags: ['tasks', 'quests', 'lists'],
  version: '1.0',
  updated: '2026-11-09',
  order: 10,
};

export default app;
