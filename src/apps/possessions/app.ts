import { Package } from 'lucide-react';
import type { AppManifest } from '../types';
import cover from './cover.svg';

const app: AppManifest = {
  name: { en: 'Possessions', he: 'רכוש' },
  tagline: { en: 'Everything you own, in one list', he: 'כל מה שיש לך, ברשימה אחת' },
  description: {
    en: 'Import spreadsheets of your books, gear or collections, then edit, filter by category, add photos and print a tidy list.',
    he: 'ייבוא גיליונות של ספרים, ציוד או אוספים, ואז עריכה, סינון לפי קטגוריה, הוספת תמונות והדפסת רשימה מסודרת.',
  },
  icon: Package,
  image: cover,
  colors: ['#f59e0b', '#db2777'],
  category: { en: 'Home', he: 'בית' },
  tags: ['inventory', 'spreadsheets'],
  version: '1.0',
  updated: '2026-11-08',
  featured: true,
  order: 1,
};

export default app;
