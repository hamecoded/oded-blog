import { useEffect } from 'react';
import { useApp } from '../lib/app';

export function usePageTitle(title?: string) {
  const { t } = useApp();
  useEffect(() => {
    document.title = title ? `${title} · ${t('siteName')}` : t('siteName');
  }, [title, t]);
}
