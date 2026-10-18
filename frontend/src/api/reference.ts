import { api } from './client';
import type { RefOption } from './types';

// All reference endpoints return stable lookup lists; cached heavily by react-query.
export const refEndpoints = {
  roles: '/ref/roles',
  leadStatuses: '/ref/lead-statuses',
  projectTypes: '/ref/project-types',
  projectStatuses: '/ref/project-statuses',
  unitStatuses: '/ref/unit-statuses',
  budgetRanges: '/ref/budget-ranges',
  timelines: '/ref/timelines',
  industries: '/ref/industries',
  subscriptionPlans: '/ref/subscription-plans',
} as const;

export type RefKey = keyof typeof refEndpoints;

export function getRefList(key: RefKey) {
  return api.get<RefOption[]>(refEndpoints[key]);
}

// Fallback used only if a given /ref/* endpoint isn't implemented yet by the backend,
// so the UI still has sensible defaults instead of breaking entirely.
export const REF_FALLBACKS: Record<RefKey, RefOption[]> = {
  roles: [
    { code: 'accountadmin', label: 'Account Admin' },
    { code: 'owner', label: 'Owner' },
    { code: 'manager', label: 'Manager' },
    { code: 'member', label: 'Member' },
  ],
  leadStatuses: [
    'New', 'Contacted', 'Follow-up', 'Site Visit Scheduled', 'Negotiation',
    'Won', 'Lost', 'On Hold', 'Duplicate', 'Not Reachable', 'Fake',
  ].map((s) => ({ code: s, label: s })),
  projectTypes: [
    { code: 'apartment', label: 'Apartment' },
    { code: 'plot', label: 'Plot' },
    { code: 'villa', label: 'Villa' },
  ],
  projectStatuses: [
    { code: 'active', label: 'Active' },
    { code: 'upcoming', label: 'Upcoming' },
    { code: 'closed', label: 'Closed' },
  ],
  unitStatuses: [
    { code: 'available', label: 'Available' },
    { code: 'held', label: 'Held' },
    { code: 'allocated', label: 'Allocated' },
    { code: 'sold', label: 'Sold' },
  ],
  budgetRanges: [
    { code: 'lt_50l', label: 'Under 50L' },
    { code: '50l_1cr', label: '50L - 1Cr' },
    { code: '1cr_2cr', label: '1Cr - 2Cr' },
    { code: 'gt_2cr', label: 'Above 2Cr' },
  ],
  timelines: [
    { code: 'immediate', label: 'Immediate' },
    { code: '1_3_months', label: '1-3 months' },
    { code: '3_6_months', label: '3-6 months' },
    { code: '6_plus_months', label: '6+ months' },
  ],
  industries: [
    { code: 'real_estate', label: 'Real Estate' },
    { code: 'other', label: 'Other' },
  ],
  subscriptionPlans: [
    { code: 'starter', label: 'Starter' },
    { code: 'professional', label: 'Professional' },
    { code: 'enterprise', label: 'Enterprise' },
  ],
};
