import { FastifyInstance } from 'fastify';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import * as crypto from 'crypto';
import { z } from 'zod';
import { withTenantTransaction } from '../../db/pool';
import { requireTenant } from '../../middleware/auth';
import { parseOrThrow } from '../../utils/validate';
import { Errors } from '../../utils/errors';
import { allow, RateLimits } from '../../middleware/rateLimit';
import { writeAuditLog } from '../../services/audit';
import { CachedImportRow, dropImport, getImport, storeImport } from './bulkImportCache';
import { EMAIL_REGEX, MOBILE_REGEX } from '../../utils/validators';

const MAX_ROWS = 5000;
const MOBILE_RE = MOBILE_REGEX;
const EMAIL_RE = EMAIL_REGEX;

const TEMPLATE_HEADERS = [
  'Full Name',
  'Mobile',
  'Email',
  'Project',
  'Budget',
  'Timeline',
  'Status',
  'Assigned To',
  'Site Visit Date',
  'Remarks'
];

function normalize(s: unknown): string {
  return String(s ?? '').trim();
}

function fuzzyMatch(value: string, candidates: Array<{ id: number; name: string }>): number | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const exact = candidates.find((c) => c.name.trim().toLowerCase() === v);
  if (exact) return exact.id;
  const contains = candidates.find(
    (c) => c.name.trim().toLowerCase().includes(v) || v.includes(c.name.trim().toLowerCase())
  );
  return contains ? contains.id : null;
}

function parseRows(buffer: Buffer, filename: string): Record<string, any>[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    return parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true });
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }
  throw Errors.validation({ file: 'Unsupported file type. Use .csv, .xlsx or .xls' });
}

const commitSchema = z.object({ importToken: z.string().min(10) }).strict();

export default function registerBulkImportRoutes(app: FastifyInstance) {
  app.get('/leads/bulk-import/template', async (_req, reply) => {
    const csv = stringifyCsv([TEMPLATE_HEADERS]);
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="lead-import-template.csv"');
    return reply.send(csv);
  });

  app.post('/leads/bulk-import/preview', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    if (!allow(`bulk-import:${actorId}`, RateLimits.BULK_IMPORT_PER_USER.windowMs, RateLimits.BULK_IMPORT_PER_USER.max)) {
      throw Errors.rateLimited('Bulk import rate limit exceeded (5/hour)');
    }

    const file = await (req as any).file();
    if (!file) throw Errors.validation({ file: 'No file uploaded' });
    const buffer: Buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) throw Errors.validation({ file: 'File exceeds 5MB limit' });

    const rawRows = parseRows(buffer, file.filename);
    if (rawRows.length > MAX_ROWS) {
      throw Errors.validation({ file: `File has ${rawRows.length} rows, exceeding the ${MAX_ROWS} row cap` });
    }

    const result = await withTenantTransaction(orgId, async (client) => {
      const [projects, budgets, timelines, statuses] = await Promise.all([
        client.query(`SELECT project_id AS id, project_name AS name FROM projects WHERE org_id = $1`, [orgId]),
        client.query(`SELECT budget_id AS id, label AS name FROM ref_budget_ranges`),
        client.query(`SELECT timeline_id AS id, label AS name FROM ref_timelines`),
        client.query(`SELECT status_id AS id, status_name AS name FROM ref_lead_statuses`)
      ]);

      const existingHashesRes = await client.query(`SELECT mobile_hash FROM leads WHERE org_id = $1`, [orgId]);
      const existingHashes = new Set(existingHashesRes.rows.map((r: any) => r.mobile_hash));

      const seenMobiles = new Map<string, number>(); // mobile -> first row number
      const rows: CachedImportRow[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        const rowNumber = i + 2; // header is row 1
        const errors: string[] = [];

        const fullName = normalize(raw['Full Name'] ?? raw['fullName'] ?? raw['full_name']);
        const mobile = normalize(raw['Mobile'] ?? raw['mobile']).replace(/\D/g, '').slice(-10);
        const email = normalize(raw['Email'] ?? raw['email']) || null;
        const projectName = normalize(raw['Project'] ?? raw['project']);
        const budgetName = normalize(raw['Budget'] ?? raw['budget']);
        const timelineName = normalize(raw['Timeline'] ?? raw['timeline']);
        const statusName = normalize(raw['Status'] ?? raw['status']) || 'New';
        const siteVisitDateRaw = normalize(raw['Site Visit Date'] ?? raw['siteVisitDate']) || null;
        const remarks = normalize(raw['Remarks'] ?? raw['remarks']) || null;

        if (!fullName) errors.push('Full Name is required');
        if (!MOBILE_RE.test(mobile)) errors.push('Mobile must be a valid 10-digit Indian mobile number');
        if (email && !EMAIL_RE.test(email)) errors.push('Email is not a valid email address');

        const projectId = projectName ? fuzzyMatch(projectName, projects.rows) : null;
        if (projectName && projectId === null) errors.push(`Project '${projectName}' not found`);
        const budgetId = budgetName ? fuzzyMatch(budgetName, budgets.rows) : null;
        if (budgetName && budgetId === null) errors.push(`Budget '${budgetName}' not found`);
        const timelineId = timelineName ? fuzzyMatch(timelineName, timelines.rows) : null;
        if (timelineName && timelineId === null) errors.push(`Timeline '${timelineName}' not found`);
        const statusId = fuzzyMatch(statusName, statuses.rows);
        if (statusId === null) errors.push(`Status '${statusName}' not found`);

        if (MOBILE_RE.test(mobile)) {
          const hash = crypto.createHash('sha256').update(mobile).digest('hex');
          if (existingHashes.has(hash)) {
            errors.push('Mobile already exists for another lead in this organization');
          }
          if (seenMobiles.has(mobile)) {
            errors.push(`Duplicate mobile within file (also on row ${seenMobiles.get(mobile)})`);
          } else {
            seenMobiles.set(mobile, rowNumber);
          }
        }

        rows.push({
          rowNumber,
          fullName,
          mobile,
          email,
          projectId,
          budgetId,
          timelineId,
          statusId,
          siteVisitDate: siteVisitDateRaw,
          remarks,
          valid: errors.length === 0,
          errors
        });
      }

      return rows;
    });

    const importToken = storeImport(orgId, actorId, result);
    // frontend/src/api/leads.ts BulkImportRow expects { rowNumber, valid, data: Record<string,string>, errors }
    // — `data` is read as row.data.name / row.data.mobile (BulkImportModal.tsx), not flat fields.
    const rows = result.map((r) => ({
      rowNumber: r.rowNumber,
      valid: r.valid,
      errors: r.errors,
      data: {
        name: r.fullName,
        mobile: r.mobile,
        email: r.email ?? '',
        remarks: r.remarks ?? ''
      }
    }));
    const validCount = result.filter((r) => r.valid).length;
    return { data: { importToken, rows, validCount, invalidCount: result.length - validCount } };
  });

  app.post('/leads/bulk-import/commit', async (req) => {
    const { orgId, userId: actorId } = requireTenant(req);
    const body = parseOrThrow(commitSchema, req.body);

    const cached = getImport(body.importToken);
    if (!cached || cached.orgId !== orgId) {
      throw Errors.notFound('Import token not found or expired');
    }

    const validRows = cached.rows.filter((r) => r.valid);

    const result = await withTenantTransaction(orgId, async (client) => {
      let inserted = 0;
      for (const row of validRows) {
        try {
          await client.query(
            `INSERT INTO leads (org_id, full_name, mobile, email, mobile_hash, project_id, budget_id, timeline_id,
               status_id, assigned_to, site_visit_date, remarks, created_by)
             VALUES ($1,$2,
               fn_encrypt_lead_pii($3, current_setting('lms.encryption_key', true)),
               fn_encrypt_lead_pii($4, current_setting('lms.encryption_key', true)),
               encode(digest($3,'sha256'),'hex'),
               $5,$6,$7,$8,NULL,$9,$10,$11)`,
            [
              orgId,
              row.fullName,
              row.mobile,
              row.email,
              row.projectId,
              row.budgetId,
              row.timelineId,
              row.statusId,
              row.siteVisitDate,
              row.remarks,
              actorId
            ]
          );
          inserted++;
        } catch {
          // skip row-level failures (e.g. race on uniqueness) without failing the whole batch
        }
      }

      await writeAuditLog(client, {
        orgId,
        userId: actorId,
        action: 'CREATE',
        tableName: 'leads',
        newValues: { bulkImport: true, inserted, totalRows: cached.rows.length },
        ipAddress: req.ip
      });

      return { inserted, skipped: cached.rows.length - validRows.length, totalRows: cached.rows.length };
    });

    dropImport(body.importToken);
    // frontend/src/api/leads.ts commitBulkImport() expects { created: number }.
    return { data: { created: result.inserted, ...result } };
  });
}
