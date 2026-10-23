import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

/**
 * Holds the signed-in user. The session itself lives in an httpOnly cookie that JavaScript cannot read;
 * on every page load we ask the server who we are (/auth/me), which is what makes sessions survive a refresh.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    api.me()
      .then((r) => { if (active) setUser(r.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setReady(true); });
    // Any API call answered with 401 means the session ended (expired, signed out elsewhere).
    const onUnauthorized = () => setUser(null);
    window.addEventListener('qv:unauthorized', onUnauthorized);
    return () => { active = false; window.removeEventListener('qv:unauthorized', onUnauthorized); };
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.login(email, password);
    setUser(r.user);
    return r.user;
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const r = await api.signup(name, email, password);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, ready, login, signup, logout }), [user, ready, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const initialsOf = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
