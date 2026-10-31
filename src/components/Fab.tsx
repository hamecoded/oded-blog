import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Archive, Languages, LogIn, Menu, PenSquare, Search, Settings2, Shield, Tags, UserRound, X } from 'lucide-react';
import { useApp } from '../lib/app';
import { can } from '../lib/util';
import { DisplaySettings } from './DisplaySettings';
import { ExportAllSheet } from './ExportAllSheet';
import { FabCtx, type FabAction } from './fabActions';

export function FabProvider({ children }: { children: ReactNode }) {
  const [pageActions, setPageActions] = useState<FabAction[]>([]);
  return (
    <FabCtx.Provider value={setPageActions}>
      {children}
      <Fab pageActions={pageActions} />
    </FabCtx.Provider>
  );
}

function Fab({ pageActions }: { pageActions: FabAction[] }) {
  const { t, user, prefs, setPrefs } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<'display' | 'export' | null>(null);

  // Close the menu on navigation (adjusted during render, not in an effect).
  const [path, setPath] = useState(loc.pathname);
  if (path !== loc.pathname) {
    setPath(loc.pathname);
    setOpen(false);
  }
  if (/\/(edit|new)$/.test(loc.pathname) || loc.pathname.endsWith('/print')) return null;

  const go = (path: string) => () => nav(path);
  const actions: FabAction[] = [
    ...pageActions,
    { id: 'search', label: t('search'), icon: <Search />, onClick: go('/search') },
    { id: 'tags', label: t('allTags'), icon: <Tags />, onClick: go('/tags') },
    ...(can.write(user) ? [{ id: 'new', label: t('newPost'), icon: <PenSquare />, onClick: go('/posts/new') }] : []),
    { id: 'display', label: t('settings'), icon: <Settings2 />, onClick: () => setSheet('display') },
    {
      id: 'lang',
      label: prefs.uiLang === 'he' ? 'English' : 'עברית',
      icon: <Languages />,
      onClick: () => setPrefs({ uiLang: prefs.uiLang === 'he' ? 'en' : 'he' }),
    },
    ...(can.export(user) ? [{ id: 'export', label: t('exportAll'), icon: <Archive />, onClick: () => setSheet('export') }] : []),
    ...(can.seeDrafts(user) ? [{ id: 'admin', label: t('admin'), icon: <Shield />, onClick: go('/admin') }] : []),
    user
      ? { id: 'account', label: t('account'), icon: <UserRound />, onClick: go('/account') }
      : { id: 'in', label: t('login'), icon: <LogIn />, onClick: go('/login') },
  ];

  return (
    <>
      {open && <div className="fab-scrim" onClick={() => setOpen(false)} />}
      <nav className={`fab${open ? ' open' : ''}`} aria-label={t('menu')}>
        {open && (
          <ul className="fab-list">
            {actions.map((a, i) => (
              <li key={a.id} style={{ animationDelay: `${(actions.length - i) * 18}ms` }}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                >
                  <span className="fab-label">{a.label}</span>
                  <span className="fab-icon">{a.icon}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="fab-main" aria-expanded={open} aria-label={t('menu')} onClick={() => setOpen((o) => !o)}>
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      <DisplaySettings open={sheet === 'display'} onClose={() => setSheet(null)} />
      <ExportAllSheet open={sheet === 'export'} onClose={() => setSheet(null)} />
    </>
  );
}
