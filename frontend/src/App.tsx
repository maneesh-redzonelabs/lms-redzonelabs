import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { useAuth } from './auth/AuthContext';

import Login from './pages/auth/Login';
import OrgSignup from './pages/auth/OrgSignup';
import Dashboard from './pages/dashboard/Dashboard';
import Users from './pages/users/Users';
import Projects from './pages/projects/Projects';
import Leads from './pages/leads/Leads';
import Allocations from './pages/allocations/Allocations';
import OrgHierarchy from './pages/org-hierarchy/OrgHierarchy';
import PlatformDashboard from './pages/platform/PlatformDashboard';
import OrganizationsDirectory from './pages/platform/OrganizationsDirectory';
import ReferenceMasters from './pages/platform/ReferenceMasters';

function RootRedirect() {
  const { user, isInitializing } = useAuth();
  if (isInitializing) return <div className="full-screen-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'platformadmin' ? '/platform' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<OrgSignup />} />

        <Route
          element={
            <ProtectedRoute allow={['accountadmin', 'owner', 'manager', 'member']}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<ProtectedRoute allow={['accountadmin']}><Users /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute allow={['accountadmin', 'owner']}><Projects /></ProtectedRoute>} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/allocations" element={<Allocations />} />
          <Route path="/org-hierarchy" element={<OrgHierarchy />} />
        </Route>

        <Route
          element={
            <ProtectedRoute allow={['platformadmin']}>
              <AppShell platform />
            </ProtectedRoute>
          }
        >
          <Route path="/platform" element={<PlatformDashboard />} />
          <Route path="/platform/organizations" element={<OrganizationsDirectory />} />
          <Route path="/platform/reference" element={<ReferenceMasters />} />
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
