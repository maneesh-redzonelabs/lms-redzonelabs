import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { Role } from '../api/types';

export function ProtectedRoute({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: Role[];
}) {
  const { user, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return <div className="full-screen-loading">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allow && !allow.includes(user.role as Role)) {
    return <Navigate to={user.role === 'platformadmin' ? '/platform' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
