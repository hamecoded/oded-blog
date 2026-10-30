import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';

export function NotFound() {
  const { t } = useApp();
  return (
    <div className="empty">
      <h1>404</h1>
      <p>{t('notFound')}</p>
      <Link className="btn primary" to="/">
        {t('backHome')}
      </Link>
    </div>
  );
}
