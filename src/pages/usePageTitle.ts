import { useEffect } from 'react';
import { useApp } from '../lib/app';
import { useSite } from '../lib/site';

/** "Title · oded.me" — on a tag-group site the group's name takes the blog's place. */
export function usePageTitle(title?: string) {
  const { t } = useApp();
  const { siteName } = useSite();
  const name = siteName || t('siteName');
  useEffect(() => {
    document.title = title ? `${title} · ${name}` : name;
  }, [title, name]);
}
