import { useAuth } from './AuthContext';
import type { Role } from '../api/types';

export interface Permissions {
  role: Role | null;
  canManageUsers: boolean;
  canManageProjects: boolean;
  canSeeProjectsNav: boolean;
  canCreateLeads: boolean;
  canBulkImportLeads: boolean;
  canAllocateUnits: boolean;
  canViewInventoryOnly: boolean;
  canSeeKpiGrid: boolean;
  canSeeAllOrgLeads: boolean;
  isCompactDashboard: boolean;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const role = (user?.role as Role) ?? null;

  return {
    role,
    canManageUsers: role === 'accountadmin',
    canManageProjects: role === 'accountadmin',
    canSeeProjectsNav: role === 'accountadmin' || role === 'owner',
    canCreateLeads: role !== null && role !== 'platformadmin',
    canBulkImportLeads: role === 'accountadmin' || role === 'manager',
    canAllocateUnits: role === 'accountadmin' || role === 'owner',
    canViewInventoryOnly: role === 'manager',
    canSeeKpiGrid: role !== 'member',
    canSeeAllOrgLeads: role === 'accountadmin' || role === 'owner',
    isCompactDashboard: role === 'member',
  };
}
