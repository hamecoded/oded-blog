import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, LogOut, Send, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { Role, RoleRequest } from '../lib/types';
import { formatDate, ROLES } from '../lib/util';
import { usePageTitle } from './usePageTitle';

/** /account — current role, password change and role requests to the manager. */
export function AccountPage() {
  const { t, user, authReady, prefs, toast, refreshUser } = useApp();
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [role, setRole] = useState<Role | ''>('');
  const [message, setMessage] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  usePageTitle(t('account'));

  const load = () => {
    api.listMyRoleRequests().then(setRequests).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [user?.id]);

  if (!authReady) return <p className="loading">{t('loading')}</p>;
  if (!user) {
    return (
      <div className="empty">
        <Link className="btn primary" to="/login" state={{ from: '/account' }}>
          {t('login')}
        </Link>
      </div>
    );
  }

  const pending = requests.find((r) => r.status === 'pending');
  const options = ROLES.filter((r) => r !== user.role);

  return (
    <div className="account">
      <header className="page-head">
        <h1>{t('account')}</h1>
        <Link className="btn ghost sm" to="/logout">
          <LogOut size={16} /> {t('logout')}
        </Link>
      </header>

      {user.must_change_password && (
        <p className="notice warn">
          <ShieldAlert size={18} className="inline-ico" /> {t('defaultPasswordWarning')}
        </p>
      )}

      <section className="panel">
        <div className="row">
          <span className="avatar">{user.display_name.slice(0, 1)}</span>
          <div className="grow">
            <strong dir="auto">{user.display_name}</strong>
            <div className="muted" dir="ltr">
              @{user.username}
            </div>
          </div>
        </div>
        <p>
          {t('yourRole')}: <span className="badge ok">{t(`role_${user.role}`)}</span>{' '}
          <span className="muted">{t(`roleHelp_${user.role}`)}</span>
        </p>
      </section>

      <section className="panel">
        <h2>{t('requestRole')}</h2>
        <p className="hint">{t('requestRoleHelp')}</p>
        {pending ? (
          <p className="notice">
            {t('requestPending')} ({t(`role_${pending.requested_role}`)})
          </p>
        ) : (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!role) return;
              setBusy(true);
              try {
                await api.requestRole(role, message);
                toast(t('requestSent'));
                setRole('');
                setMessage('');
                load();
              } catch (err) {
                toast(errorText(err, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="role-pick" role="radiogroup" aria-label={t('role')}>
              {options.map((r) => (
                <label key={r} className={`role-opt${role === r ? ' on' : ''}`}>
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                  <strong>{t(`role_${r}`)}</strong>
                  <small>{t(`roleHelp_${r}`)}</small>
                </label>
              ))}
            </div>
            <label>
              {t('requestMessage')}
              <textarea dir="auto" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <div className="row end">
              <button className="btn primary" disabled={!role || busy}>
                <Send size={16} /> {t('sendRequest')}
              </button>
            </div>
          </form>
        )}
        {requests.length > 0 && (
          <>
            <h3>{t('myRequests')}</h3>
            <ul className="admin-list">
              {requests.map((r) => (
                <li key={r.id}>
                  <span className="grow">
                    <strong>{t(`role_${r.requested_role}`)}</strong>
                    <small className="muted">{formatDate(r.created_at, prefs.uiLang)}</small>
                  </span>
                  <span className={`badge status-${r.status}`}>{t(`status_${r.status}`)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel">
        <h2>{t('changePassword')}</h2>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.changePassword(pw);
              await refreshUser();
              setPw('');
              toast(t('passwordChanged'));
            } catch (err) {
              toast(errorText(err, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t('newPassword')}
            <input type="password" dir="ltr" required minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <div className="row end">
            <button className="btn primary" disabled={busy || pw.length < 6}>
              <KeyRound size={16} /> {t('changePassword')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
