import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { withTransaction } from '../../db/pool';
import { parseOrThrow } from '../../utils/validate';
import { Errors } from '../../utils/errors';
import { allow, RateLimits } from '../../middleware/rateLimit';
import { slugify } from '../../utils/slug';
import { writeAuditLog } from '../../services/audit';
import { MOCK_OTP, sendOtp, verifyOtp } from '../../services/otp';
import { startSchema, resendOtpSchema, verifySchema, paymentStubSchema } from './schemas';

const OTP_TTL_MIN = 15;
const BCRYPT_COST = 12;

export default async function onboardingRoutes(app: FastifyInstance) {
  app.post('/start', async (req) => {
    const body = parseOrThrow(startSchema, req.body);

    // mobile_otp_hash/email_otp_hash are NOT NULL columns left over from when each OTP was
    // random and hashed per request; now every OTP is the shared mock code (see services/otp.ts),
    // verified by direct comparison, so these just hold a placeholder hash of that fixed code.
    const otpHash = await bcrypt.hash(MOCK_OTP, BCRYPT_COST);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60000);

    const verificationId = await withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO onboarding_verifications
           (org_name, industry, country, timezone, subscription_plan, contact_name, mobile, email,
            mobile_otp_hash, email_otp_hash, expires_at, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING verification_id`,
        [
          body.orgName,
          body.industry,
          body.country,
          body.timezone,
          body.subscriptionPlan,
          body.contactName,
          body.mobile,
          body.email,
          otpHash,
          otpHash,
          expiresAt,
          req.ip
        ]
      );
      return res.rows[0].verification_id;
    });

    sendOtp('email', body.email, `onboarding verification #${verificationId}`);

    return { data: { verificationId: String(verificationId), expiresAt } };
  });

  app.post('/:verificationId/resend-otp', async (req) => {
    if (!allow(`ob-resend:${req.ip}`, RateLimits.ONBOARDING_VERIFY_PER_IP.windowMs, RateLimits.ONBOARDING_VERIFY_PER_IP.max)) {
      throw Errors.rateLimited();
    }
    const { verificationId } = req.params as { verificationId: string };
    parseOrThrow(resendOtpSchema, req.body);

    const result = await withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM onboarding_verifications WHERE verification_id = $1`, [
        verificationId
      ]);
      if (res.rows.length === 0) throw Errors.notFound('Verification not found');
      const row = res.rows[0];
      if (row.verified_at) throw Errors.validation({ verification: 'already verified' });
      if (row.attempt_count >= 5) throw Errors.tooManyAttempts('Maximum OTP resend attempts reached');

      const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60000);
      await client.query(
        `UPDATE onboarding_verifications SET attempt_count = attempt_count + 1, expires_at = $1 WHERE verification_id = $2`,
        [expiresAt, verificationId]
      );

      sendOtp('email', row.email, `onboarding verification #${verificationId} (resend)`);
      return { expiresAt };
    });

    return { data: result };
  });

  app.post('/:verificationId/verify', async (req) => {
    const { verificationId } = req.params as { verificationId: string };
    const body = parseOrThrow(verifySchema, req.body);

    const result = await withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM onboarding_verifications WHERE verification_id = $1`, [
        verificationId
      ]);
      if (res.rows.length === 0) throw Errors.notFound('Verification not found');
      const row = res.rows[0];

      if (row.verified_at) throw Errors.validation({ verification: 'already verified' });
      if (new Date(row.expires_at).getTime() < Date.now()) {
        throw Errors.validation({ otp: 'OTP has expired, please resend' });
      }

      if (!verifyOtp(body.emailOtp)) {
        throw Errors.validation({ otp: 'Incorrect code. Use the demo code shown above.' });
      }

      await client.query(
        `UPDATE onboarding_verifications SET mobile_verified = TRUE, email_verified = TRUE, verified_at = CURRENT_TIMESTAMP WHERE verification_id = $1`,
        [verificationId]
      );

      const planRes = await client.query(
        `SELECT max_users, max_projects FROM ref_subscription_plans WHERE plan_name = $1`,
        [row.subscription_plan]
      );
      if (planRes.rows.length === 0) throw Errors.validation({ subscriptionPlan: 'unknown plan' });
      const { max_users, max_projects } = planRes.rows[0];

      const isTrial = row.subscription_plan === 'trial';
      const subscriptionStatus = isTrial ? 'trialing' : 'active';
      const trialEndsAt = isTrial ? new Date(Date.now() + 14 * 86400000) : null;

      let slug = slugify(row.org_name);
      let suffix = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
        const exists = await client.query(`SELECT 1 FROM organizations WHERE org_slug = $1`, [candidate]);
        if (exists.rows.length === 0) {
          slug = candidate;
          break;
        }
        suffix += 1;
      }

      const orgRes = await client.query(
        `INSERT INTO organizations
           (org_name, org_slug, industry, country, timezone, subscription_plan, subscription_status,
            trial_ends_at, max_users, max_projects, onboarding_step, onboarding_complete,
            primary_contact_name, primary_contact_mobile, primary_contact_email, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,5,TRUE,$11,$12,$13,TRUE)
         RETURNING org_id, org_slug`,
        [
          row.org_name,
          slug,
          row.industry,
          row.country,
          row.timezone,
          row.subscription_plan,
          subscriptionStatus,
          trialEndsAt,
          max_users,
          max_projects,
          row.contact_name,
          row.mobile,
          row.email
        ]
      );
      const org = orgRes.rows[0];

      // Sign-in is mobile + OTP only now, so there is no user-chosen password to hash here.
      // password_hash is still NOT NULL on `users` (used only by the separate step-up
      // re-authentication feature), so store a random, never-shared value as a placeholder.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_COST);
      const roleRes = await client.query(`SELECT role_id FROM ref_roles WHERE role_name = 'accountadmin'`);
      const userRes = await client.query(
        `INSERT INTO users (org_id, full_name, mobile, email, password_hash, role_id, manager_id, user_type, is_active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,'Internal',TRUE,NULL)
         RETURNING user_id`,
        [org.org_id, row.contact_name, row.mobile, row.email, passwordHash, roleRes.rows[0].role_id]
      );

      await writeAuditLog(client, {
        orgId: org.org_id,
        userId: userRes.rows[0].user_id,
        action: 'CREATE',
        tableName: 'organizations',
        recordId: org.org_id,
        newValues: { org_name: row.org_name, org_slug: slug },
        ipAddress: req.ip
      });

      return { orgId: org.org_id, orgSlug: org.org_slug };
    });

    return { data: result };
  });

  // Stub: payment collection is out of scope for local dev. Accepts and no-ops for paid plans.
  app.post('/:verificationId/payment', async (req) => {
    const { verificationId } = req.params as { verificationId: string };
    parseOrThrow(paymentStubSchema, req.body ?? {});
    return {
      data: {
        verificationId,
        paymentStatus: 'skipped',
        note: 'Payment collection is stubbed in local dev; no gateway is integrated.'
      }
    };
  });
}
