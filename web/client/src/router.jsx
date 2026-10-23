import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// A small History-API router: real paths in the address bar (/login, /dashboard), no "#/" hashes.
const RouterContext = createContext(null);

function readLocation() {
  // Old bookmarks used "#/app"; send them to the real path.
  if (window.location.hash.startsWith('#/app')) window.history.replaceState(null, '', '/dashboard');
  else if (window.location.hash === '#/') window.history.replaceState(null, '', '/');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return { path, search: window.location.search, hash: window.location.hash };
}

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.origin);
    if (url.origin !== window.location.origin) { window.location.assign(to); return; }
    const next = url.pathname + url.search + url.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) window.history[replace ? 'replaceState' : 'pushState'](null, '', next);
    setLoc(readLocation());
  }, []);

  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

/** A real <a href>: middle-click, "open in new tab" and copy-link all work; plain clicks navigate in-app. */
export function Link({ to, replace, onClick, children, ...rest }) {
  const { navigate } = useRouter();
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}

/** Scroll to a landing-page section and keep the address bar in sync ("/#features"). */
export function useSectionNav() {
  const { path, navigate } = useRouter();
  return useCallback((id) => {
    if (path === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `/#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  }, [path, navigate]);
}

/** Section link: a real "/#id" href that scrolls in place. */
export function SectionLink({ id, children, onClick, ...rest }) {
  const goSection = useSectionNav();
  return (
    <a href={`/#${id}`} {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        goSection(id);
      }}>
      {children}
    </a>
  );
}

/** Only follow same-site paths from a ?next= parameter (blocks open redirects like //evil.com). */
export function safeNext(search) {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : null;
}

export function usePageTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}
