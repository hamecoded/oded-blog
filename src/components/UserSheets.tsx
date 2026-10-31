import { useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { Profile, Role } from '../lib/types';
import { ROLES, tempPassword, USERNAME_RE } from '../lib/util';
import { Sheet } from './Sheet';

/** Temporary-password field with Generate and Copy. */
function TempPasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, toast } = useApp();
  return (
    <label>
      {t('tempPassword')}
      <span className="row">
        <input dir="ltr" required minLength={6} className="mono" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="icon-btn" aria-label={t('generate')} title={t('generate')} onClick={() => onChange(tempPassword())}>
          <RefreshCw size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('copy')}
          title={t('copy')}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast(t('copiedText')))}
        >
          <Copy size={18} />
        </button>
      </span>
      <small className="hint">{t('tempPasswordHelp')}</small>
    </label>
  );
}

/** Add a user (user = null) or edit one's name and username. */
export function UserSheet({ open, user, onClose, onSaved }: { open: boolean; user: Profile | null; onClose: () => void; onSaved: () => void }) {
  const { t, toast } = useApp();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('reader');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Refill the form each time the sheet opens (adjusted during render, not in an effect).
  const [shownFor, setShownFor] = useState<{ open: boolean; user: Profile | null }>({ open: false, user: null });
  if (shownFor.open !== open || shownFor.user !== user) {
    setShownFor({ open, user });
    if (open) {
      setEmail(user?.email ?? '');
      setName(user?.display_name ?? '');
      setUsername(user?.username ?? '');
      setRole(user?.role ?? 'reader');
      setPassword(tempPassword());
    }
  }

  const usernameOk = !user || USERNAME_RE.test(username.trim().toLowerCase());

  return (
    <Sheet open={open} onClose={onClose} title={user ? t('editUser') : t('addUser')}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (user) {
              await api.updateUser(user.id, { display_name: name, username });
              toast(t('saved'));
            } else {
              await api.createUser({ email, display_name: name, role, password });
              toast(t('userCreated'));
            }
            onSaved();
            onClose();
          } catch (err) {
            toast(errorText(err, t));
          } finally {
            setBusy(false);
          }
        }}
      >
        {user ? (
          <p className="hint" dir="ltr">
            {user.email}
          </p>
        ) : (
          <label>
            {t('email')}
            <input type="email" dir="ltr" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        <label>
          {t('displayName')}
          <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {user && (
          <label>
            {t('username')}
            <input dir="ltr" required value={username} aria-invalid={!usernameOk} onChange={(e) => setUsername(e.target.value)} />
            {!usernameOk && <small className="error">{t('usernameInvalid')}</small>}
          </label>
        )}
        {!user && (
          <>
            <label>
              {t('role')}
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r}`)} · {t(`roleHelp_${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <TempPasswordField value={password} onChange={setPassword} />
          </>
        )}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn primary" disabled={busy || !usernameOk}>
            {user ? t('save') : t('addUser')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Set a temporary password for someone else. */
export function PasswordSheet({ user, onClose, onSaved }: { user: Profile | null; onClose: () => void; onSaved: () => void }) {
  const { t, toast } = useApp();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // A fresh temporary password for each person (adjusted during render, not in an effect).
  const [shownFor, setShownFor] = useState<Profile | null>(null);
  if (shownFor !== user) {
    setShownFor(user);
    if (user) setPassword(tempPassword());
  }

  return (
    <Sheet open={!!user} onClose={onClose} title={`${t('resetPassword')} · ${user?.display_name ?? ''}`}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) return;
          setBusy(true);
          try {
            await api.resetPassword(user.id, password);
            toast(t('passwordSet'));
            onSaved();
            onClose();
          } catch (err) {
            toast(errorText(err, t));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TempPasswordField value={password} onChange={setPassword} />
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn primary" disabled={busy}>
            {t('setPassword')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
