import React, { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import Background from './components/Background.jsx';
import { ConfirmProvider } from './components/ConfirmDialog.jsx';
import Footer from './components/Footer.jsx';
import Navbar from './components/Navbar.jsx';
import { DashboardSkeleton } from './components/ui.jsx';
import { tabForPath } from './pages/dashboardTabs.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Signup from './pages/Signup.jsx';
import { RouterProvider, safeNext, useRouter } from './router.jsx';

// The dashboard pulls in the charting library, so it is a separate download: the landing page stays small.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));

const PageSkeleton = () => <div className="wrap pt-12"><DashboardSkeleton /></div>;

/** Protected route: anonymous visitors are sent to /login, and come back here after signing in. */
function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const { path, search, navigate } = useRouter();
  useEffect(() => {
    if (ready && !user) navigate(`/login?next=${encodeURIComponent(path + search)}`, { replace: true });
  }, [ready, user, path, search, navigate]);
  return ready && user ? <Suspense fallback={<PageSkeleton />}>{children}</Suspense> : <PageSkeleton />;
}

/** Sign-in and sign-up pages are for signed-out visitors; signed-in users are sent on to their destination. */
function GuestOnly({ children }) {
  const { user, ready } = useAuth();
  const { search, navigate } = useRouter();
  useEffect(() => {
    if (ready && user) navigate(safeNext(search) || '/dashboard', { replace: true });
  }, [ready, user, search, navigate]);
  return ready && !user ? children : <PageSkeleton />;
}

function CurrentPage() {
  const { path } = useRouter();
  if (path === '/') return <Landing />;
  if (path === '/login') return <GuestOnly><Login /></GuestOnly>;
  if (path === '/signup') return <GuestOnly><Signup /></GuestOnly>;
  if (path === '/account') return <RequireAuth><Account /></RequireAuth>;
  const tab = tabForPath(path); // /dashboard and /dashboard/risk, /qkd, ... share one Dashboard, so its state survives tab changes
  if (tab) return <RequireAuth><Dashboard tab={tab.key} /></RequireAuth>;
  return <NotFound />;
}

function Shell() {
  const { path, hash } = useRouter();

  // New page: scroll to its #section if the URL names one, otherwise to the top.
  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [path, hash]);

  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to Content</a>
      <Background />
      <Navbar />
      <main id="main" tabIndex={-1}><CurrentPage /></main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <ConfirmProvider>
          <Shell />
        </ConfirmProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
