import React from 'react';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span>
        Page {page} of {totalPages} ({total} total)
      </span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Prev
      </button>
      <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
