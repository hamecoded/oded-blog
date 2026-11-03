import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useSite } from '../lib/site';

export function NotFound() {
  const { t } = useApp();
  // Inside a tag-group site, "back home" is the site's own landing page.
  const { link } = useSite();
  return (
    <div className="empty">
      <h1>404</h1>
      <p>{t('notFound')}</p>
      <Link className="btn primary" to={link('/')}>
        {t('backHome')}
      </Link>
    </div>
  );
}
