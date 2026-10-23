import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import Background from './components/Background.jsx';
import Footer from './components/Footer.jsx';
import Navbar from './components/Navbar.jsx';
import { DashboardSkeleton } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Signup from './pages/Signup.jsx';
import { RouterProvider, safeNext, useRouter } from './router.jsx';

const PageSkeleton = () => <div className="wrap pt-12"><DashboardSkeleton /></div>;

/** Protected route: anonymous visitors are sent to /login, and come back here after signing in. */
function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const { path, search, navigate } = useRouter();
  useEffect(() => {
    if (ready && !user) navigate(`/login?next=${encodeURIComponent(path + search)}`, { replace: true });
  }, [ready, user, path, search, navigate]);
  return ready && user ? children : <PageSkeleton />;
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
  switch (path) {
    case '/': return <Landing />;
    case '/login': return <GuestOnly><Login /></GuestOnly>;
    case '/signup': return <GuestOnly><Signup /></GuestOnly>;
    case '/dashboard': return <RequireAuth><Dashboard /></RequireAuth>;
    default: return <NotFound />;
  }
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
      <Background />
      <Navbar />
      <main><CurrentPage /></main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </RouterProvider>
  );
}
