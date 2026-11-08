import { Sparkles } from 'lucide-react';
import type { AppManifest } from '../types';
// import cover from './cover.png';

// Copy this folder to src/apps/<your-app-id>/ (no leading _) to start a new app. Every field is described in
// ../types.ts; only name, description and icon are required.
const app: AppManifest = {
  name: { en: 'App name', he: 'שם האפליקציה' },
  tagline: { en: 'One short line', he: 'שורה קצרה אחת' },
  description: { en: 'What it does, in a sentence or two.', he: 'מה היא עושה, במשפט או שניים.' },
  icon: Sparkles,
  // image: cover,
  // colors: ['#6366f1', '#ec4899'],
  // category: { en: 'Productivity', he: 'פרודוקטיביות' },
  // tags: ['example'],
  // status: 'beta',
  // version: '0.1',
  // updated: '2026-11-08',
  // url: 'https://example.com',   // for an app hosted elsewhere; then App.tsx isn't needed
  // featured: true,
  // order: 50,
};

export default app;
