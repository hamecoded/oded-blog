import { useEffect } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider, ScrollRestoration, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from './lib/api';
import { useApp } from './lib/app';
import { AppProvider } from './lib/AppProvider';
import { can } from './lib/util';
import { FabProvider } from './components/Fab';
import { ArchivePage, AuthorPage, Home, SearchPage, TagPage, TagsPage } from './pages/Lists';
import { PostView } from './pages/PostView';
import { PrintView } from './pages/PrintView';
import { AuthPage, Logout } from './pages/Auth';
import { AccountPage } from './pages/Account';
import { NotFound } from './pages/NotFound';
import { PrivacyPage } from './pages/Privacy';

function Layout() {
  const { t, user, toastMsg } = useApp();
  const loc = useLocation();
  const bare = loc.pathname.endsWith('/print');
  // Exporting is admin-only; also discourage the browser's own Print / Save as PDF.
  const canExport = can.export(user);
  useEffect(() => {
    document.documentElement.classList.toggle('print-locked', !canExport);
  }, [canExport]);
  return (
    <FabProvider>
      {!bare && (
        <header className="site-header">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              ✎
            </span>
            {t('siteName')}
          </Link>
          <nav>
            <Link to="/tags">{t('tags')}</Link>
            <Link to="/search" aria-label={t('search')} className="icon-link">
              <Search size={20} />
            </Link>
            {user ? (
              <Link
                to="/account"
                className="avatar"
                title={`${user.display_name} · ${t(`role_${user.role}`)}`}
              >
                {user.display_name.slice(0, 1)}
              </Link>
            ) : (
              <Link to="/login" state={{ from: loc.pathname }} className="btn ghost sm">
                {t('login')}
              </Link>
            )}
          </nav>
        </header>
      )}
      {api.mode === 'local' && !bare && <div className="demo-banner">{t('demoMode')}</div>}
      {user?.must_change_password && !bare && loc.pathname !== '/account' && (
        <Link to="/account" className="demo-banner warn">
          {t('defaultPasswordWarning')}
        </Link>
      )}
      <main className={bare ? '' : 'container'}>
        <Outlet />
      </main>
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
      <ScrollRestoration />
    </FabProvider>
  );
}

/**
 * Readable, resource-style URLs:
 *   /posts/:slug          a post            /posts/:slug/edit   edit it
 *   /posts/:slug/print    PDF of a post     /posts/print        PDF of all posts
 *   /posts/new            write a post
 *   /tags, /tags/:tag     tag index / posts by tag
 *   /authors/:username    posts by author   /archive/:year/:month?
 *   /search?q=…&tag=…     search            /admin              manage posts, users, role requests
 *   /account              role, password, request a role
 *   /privacy              privacy policy (linked from Google's sign-in setup)
 */
// The editor (TipTap) only loads for writers.
const editor = () => import('./pages/PostEditor').then((m) => ({ Component: m.PostEditor }));

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: '/', element: <Home /> },
        { path: '/posts/new', lazy: editor },
        { path: '/posts/print', element: <PrintView /> },
        { path: '/posts/:slug', element: <PostView /> },
        { path: '/posts/:slug/edit', lazy: editor },
        { path: '/posts/:slug/print', element: <PrintView /> },
        { path: '/tags', element: <TagsPage /> },
        { path: '/tags/:tag', element: <TagPage /> },
        { path: '/authors/:username', element: <AuthorPage /> },
        { path: '/archive/:year/:month?', element: <ArchivePage /> },
        { path: '/search', element: <SearchPage /> },
        { path: '/login', element: <AuthPage mode="login" /> },
        { path: '/signup', element: <AuthPage mode="signup" /> },
        { path: '/logout', element: <Logout /> },
        { path: '/account', element: <AccountPage /> },
        { path: '/privacy', element: <PrivacyPage /> },
        { path: '/admin', lazy: () => import('./pages/Admin').then((m) => ({ Component: m.AdminPage })) },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
