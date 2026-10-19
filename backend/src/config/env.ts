import * as dotenv from 'dotenv';
dotenv.config();

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  pg: {
    host: req('PGHOST', 'localhost'),
    port: parseInt(req('PGPORT', '5432'), 10),
    user: req('PGUSER', 'postgres'),
    password: req('PGPASSWORD', ''),
    database: req('PGDATABASE', 'postgres'),
    schema: req('PGSCHEMA', 'lms')
  },
  jwtSecret: req('JWT_SECRET'),
  accessTokenTtlMin: parseInt(req('ACCESS_TOKEN_TTL_MIN', '15'), 10),
  refreshTokenTtlDays: parseInt(req('REFRESH_TOKEN_TTL_DAYS', '7'), 10),
  piiEncKey: req('LMS_PII_ENC_KEY'),
  corsOrigin: req('CORS_ORIGIN', 'http://localhost:5174'),
  port: parseInt(req('PORT', '4000'), 10),
  nodeEnv: req('NODE_ENV', 'development')
};
