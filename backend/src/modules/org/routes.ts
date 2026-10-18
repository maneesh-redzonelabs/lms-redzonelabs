import { FastifyInstance } from 'fastify';
import { withTenantTransaction } from '../../db/pool';
import { authenticate, requireTenant } from '../../middleware/auth';

interface UserNode {
  userId: number;
  fullName: string;
  role: string;
  managerId: number | null;
  isActive: boolean;
  children: UserNode[];
}

export default async function orgRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/hierarchy', async (req) => {
    const { orgId } = requireTenant(req);
    return withTenantTransaction(orgId, async (client) => {
      const res = await client.query(
        `SELECT u.user_id, u.full_name, u.manager_id, u.is_active, r.role_name
         FROM users u JOIN ref_roles r ON r.role_id = u.role_id
         WHERE u.org_id = $1 ORDER BY u.full_name`,
        [orgId]
      );

      const nodes = new Map<number, UserNode>();
      for (const row of res.rows) {
        nodes.set(row.user_id, {
          userId: row.user_id,
          fullName: row.full_name,
          role: row.role_name,
          managerId: row.manager_id,
          isActive: row.is_active,
          children: []
        });
      }
      const roots: UserNode[] = [];
      for (const node of nodes.values()) {
        if (node.managerId && nodes.has(node.managerId)) {
          nodes.get(node.managerId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      // frontend/src/pages/org-hierarchy/OrgHierarchy.tsx / api/types.ts OrgHierarchyNode
      // expects GET /org/hierarchy to resolve to a single root node (query.data is rendered
      // directly as <TreeNode node={query.data} />), not an array of roots.
      let root: UserNode;
      if (roots.length === 1) {
        root = roots[0];
      } else {
        root = { userId: 0, fullName: 'Organization', role: '', managerId: null, isActive: true, children: roots };
      }

      // frontend/src/api/types.ts OrgHierarchyNode: { id, name, role, children } — `userId` has
      // no underscore so the global camelCase hook leaves it as-is, and `fullName` would stay
      // `fullName` rather than become `name`. Map explicitly, recursively.
      function toNode(n: UserNode): any {
        return { id: n.userId, name: n.fullName, role: n.role, children: n.children.map(toNode) };
      }
      return { data: toNode(root) };
    });
  });
}
