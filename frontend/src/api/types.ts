export type Role = 'accountadmin' | 'owner' | 'manager' | 'member' | 'platformadmin';

export interface User {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  role: Role;
  status: 'active' | 'inactive';
  reportsTo?: string | null;
  reportsToName?: string | null;
  userType?: 'Internal' | 'External';
  companyName?: string | null;
  orgId?: string;
  orgName?: string;
  orgLogoUrl?: string | null;
  createdAt?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  country?: string;
  timezone?: string;
  subscriptionPlan?: string;
  status?: string;
  orgStatus?: 'Pending' | 'Active' | 'Suspended';
  usersMax?: number;
  usersCount?: number;
  activeProjects?: number;
  totalLeads?: number;
  trialEndsAt?: string | null;
  primaryContactMobile?: string;
  createdAt?: string;
}

export interface Project {
  id: string;
  name: string;
  type: string;
  status: string;
  location?: string;
  totalUnits?: number;
  availableUnits?: number;
  heldUnits?: number;
  soldUnits?: number;
  createdAt?: string;
}

export interface Unit {
  id: string;
  projectId: string;
  code: string;
  status: string;
  floor?: number;
  tower?: string;
  price?: number;
  allocatedLeadId?: string | null;
}

export interface Lead {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  status: string;
  projectId?: string;
  projectName?: string;
  ownerId?: string;
  ownerName?: string;
  budgetRange?: string;
  timeline?: string;
  source?: string;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: string;
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export interface LeadHistoryEntry {
  id: string;
  leadId: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  changedAt: string;
  changedBy?: string;
  remarks?: string;
}

export interface Allocation {
  id: string;
  unitId: string;
  unitCode?: string;
  projectId: string;
  projectName?: string;
  leadId: string;
  leadName?: string;
  status: string;
  allocatedAt?: string;
}

export interface DashboardSummary {
  totalLeads: number;
  newLeadsToday: number;
  wonLeads: number;
  lostLeads: number;
  siteVisitsToday: number;
  openLeads: number;
  unassignedLeads?: number;
  leadsByStatus?: Record<string, number>;
  projects?: Project[];
  activeUsers?: number;
  maxUsers?: number | null;
  maxProjects?: number | null;
  subscriptionPlan?: string | null;
}

export interface UsersBreakdown {
  userId: string;
  userName: string;
  totalLeads: number;
  openLeads: number;
  wonLeads: number;
}

export interface OrgHierarchyNode {
  id: string;
  name: string;
  role: Role;
  children: OrgHierarchyNode[];
}

export interface RefOption {
  code: string;
  label: string;
}

export interface AuditLogEntry {
  id: string;
  actorId?: string;
  actorName?: string;
  action: string;
  entity?: string;
  entityId?: string;
  createdAt: string;
  details?: unknown;
}
