import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as leadsApi from '../../api/leads';
import type { BulkImportPreviewResult } from '../../api/leads';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../api/client';

export function BulkImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BulkImportPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: (file: File) => leadsApi.previewBulkImport(file),
    onSuccess: (result) => { setPreview(result); setError(null); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not parse file.'),
  });

  const commitMutation = useMutation({
    mutationFn: (importToken: string) => leadsApi.commitBulkImport(importToken),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      notify(`${result.created} leads imported.`, 'success');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not commit import.'),
  });

  async function handleDownloadTemplate() {
    try {
      const blob = await leadsApi.downloadBulkImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download template.');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) previewMutation.mutate(file);
  }

  return (
    <Modal title="Bulk import leads" onClose={onClose} wide>
      {!preview && (
        <div>
          <p>Upload a CSV file of leads. Download the template to see the expected columns.</p>
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn" onClick={handleDownloadTemplate}>Download template</button>
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? 'Parsing…' : 'Choose file'}
            </button>
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleFileChange} />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      )}

      {preview && (
        <div>
          <div className="alert alert-info">
            {preview.validCount} valid row(s), {preview.invalidCount} invalid row(s) out of {preview.rows.length}.
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Row</th><th>Name</th><th>Mobile</th><th>Status</th></tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} title={row.errors?.join('; ')}>
                    <td>{row.rowNumber}</td>
                    <td>{row.data.name || '-'}</td>
                    <td>{row.data.mobile || '-'}</td>
                    <td>
                      {row.valid ? (
                        <span className="badge badge-active-status">Valid</span>
                      ) : (
                        <span className="badge badge-inactive" title={row.errors?.join('; ')}>Invalid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setPreview(null)}>Choose a different file</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!preview.validCount || commitMutation.isPending}
              onClick={() => commitMutation.mutate(preview.importToken)}
            >
              {commitMutation.isPending ? 'Importing…' : `Import ${preview.validCount} valid rows`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
