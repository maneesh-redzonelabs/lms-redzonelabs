import * as crypto from 'crypto';

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomOtp6(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function maskPiiInJson(value: unknown): unknown {
  const mobileRe = /\b\d{10}\b/g;
  const emailRe = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  function maskString(s: string): string {
    return s.replace(emailRe, (m) => m[0] + '***@***').replace(mobileRe, (m) => m.slice(0, 2) + '******' + m.slice(-2));
  }
  function walk(v: any): any {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return maskString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const k of Object.keys(v)) out[k] = walk(v[k]);
      return out;
    }
    return v;
  }
  return walk(value);
}
