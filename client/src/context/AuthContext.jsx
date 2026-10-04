import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, getToken, setToken, clearToken, UNAUTHORIZED_EVENT } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // A rejected token (expired or revoked mid-session) is reported by the API
  // client. Clear the session so the route guard sends the user to /login.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Restore the session on a page reload.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await authApi.login(email, password);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'ADMIN',
    employeeId: user?.employee?.employee_id ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}