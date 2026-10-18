import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  cardLabel?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyMessage = 'No records found.',
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return <div className="table-empty">Loading…</div>;
  }
  if (!rows.length) {
    return <div className="table-empty">{emptyMessage}</div>;
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-cards">
        {rows.map((row) => (
          <div className="table-card" key={row.id}>
            {columns.map((col) => (
              <div className="table-card-row" key={col.key}>
                <span className="k">{col.cardLabel ?? col.header}</span>
                <span>{col.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
