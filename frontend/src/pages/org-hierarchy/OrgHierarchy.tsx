import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOrgHierarchy } from '../../api/dashboard';
import type { OrgHierarchyNode } from '../../api/types';

function TreeNode({ node }: { node: OrgHierarchyNode }) {
  return (
    <li>
      <div className="tree-node">
        <strong>{node.name}</strong>
        <span className="badge badge-neutral">{node.role}</span>
      </div>
      {node.children?.length > 0 && (
        <ul className="tree">
          {node.children.map((child) => <TreeNode key={child.id} node={child} />)}
        </ul>
      )}
    </li>
  );
}

export default function OrgHierarchy() {
  const query = useQuery({ queryKey: ['org-hierarchy'], queryFn: getOrgHierarchy });

  return (
    <div>
      <div className="card-header"><h2>Org hierarchy</h2></div>
      <div className="card">
        {query.isLoading && <div className="table-empty">Loading…</div>}
        {query.isError && <div className="alert alert-error">Could not load org hierarchy.</div>}
        {query.data && (
          <ul className="tree tree-root">
            <TreeNode node={query.data} />
          </ul>
        )}
      </div>
    </div>
  );
}
