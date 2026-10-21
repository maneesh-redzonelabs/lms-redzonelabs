import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { configureApiClient } from '../api/client';
import * as authApi from '../api/auth';
import { me as fetchMe } from '../api/auth';
import type { AuthSession, User } from '../api/types';

const STORAGE_KEY = 'lms.auth.refreshToken';

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isInitializing: boolean;
  loginWithOtp: (input: { mobile: string; otp: string }) => Promise<User>;
  loginWithToken: (accessToken: string) => Promise<User>;
  logout: () => Promise<void>;
  isPlatformAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const applySession = useCallback((session: AuthSession) => {
    setAccessToken(session.accessToken);
    accessTokenRef.current = session.accessToken;
    setUser(session.user);
    if (session.refreshToken) {
      localStorage.setItem(STORAGE_KEY, session.refreshToken);
    }
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    accessTokenRef.current = null;
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const doRefresh = useCallback((): Promise<string | null> => {
    // The refresh token is single-use and rotates on every call (see backend POST /auth/refresh),
    // so two concurrent calls racing on the same stored token is fatal: the first rotates it and
    // succeeds, the second then finds a stale token, fails, and wipes the session that the first
    // call just restored. This happens in practice - React 18 StrictMode double-invokes the
    // mount effect below in dev, and any two API calls that both 401 at once would otherwise both
    // try to refresh. Dedupe by sharing one in-flight promise across all callers.
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = (async () => {
      const refreshToken = localStorage.getItem(STORAGE_KEY);
      if (!refreshToken) return null;
      try {
        const session = await authApi.refresh(refreshToken);
        applySession(session);
        return session.accessToken;
      } catch {
        clearSession();
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, [applySession, clearSession]);

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: doRefresh,
      onUnauthorized: () => clearSession(),
    });
  }, [doRefresh, clearSession]);

  useEffect(() => {
    (async () => {
      const refreshToken = localStorage.getItem(STORAGE_KEY);
      if (!refreshToken) {
        setIsInitializing(false);
        return;
      }
      const token = await doRefresh();
      if (token) {
        try {
          const freshUser = await fetchMe();
          setUser(freshUser);
        } catch {
          clearSession();
        }
      }
      setIsInitializing(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const loginWithOtp = useCallback(
    async (input: { mobile: string; otp: string }) => {
      const session = await authApi.verifyLoginOtp(input);
      applySession(session);
      return session.user;
    },
    [applySession]
  );

  const loginWithToken = useCallback(
    async (token: string) => {
      setAccessToken(token);
      accessTokenRef.current = token;
      const freshUser = await fetchMe();
      setUser(freshUser);
      return freshUser;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore network errors on logout
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isInitializing,
      loginWithOtp,
      loginWithToken,
      logout,
      isPlatformAdmin: user?.role === 'platformadmin',
    }),
    [user, accessToken, isInitializing, loginWithOtp, loginWithToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
