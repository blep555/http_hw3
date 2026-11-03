import { createHmac, timingSafeEqual } from 'node:crypto';

export function settings(env = process.env) {
  const secret = env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || secret === 'replace-with-a-random-secret-of-at-least-32-bytes') {
    throw new Error('Set JWT_SECRET to a random secret of at least 32 bytes');
  }
  return { secret, issuer: env.JWT_ISSUER || 'http-hw3', audience: env.JWT_AUDIENCE || 'legacy-service' };
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signToken(payload, config) {
  const input = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode(payload);
  const signature = createHmac('sha256', config.secret).update(input).digest('base64url');
  return input + '.' + signature;
}

export function verifyToken(token, config, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 8192) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Invalid token');
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', config.secret).update(header + '.' + payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid signature');
  const meta = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!meta || meta.alg !== 'HS256' || meta.typ !== 'JWT' || meta.crit !== undefined || meta.b64 !== undefined) throw new Error('Invalid header');
  if (!claims || typeof claims.sub !== 'string' || !claims.sub.trim()) throw new Error('Missing subject');
  if (claims.iss !== config.issuer || claims.aud !== config.audience) throw new Error('Invalid issuer or audience');
  if (!Number.isSafeInteger(claims.exp) || claims.exp <= now) throw new Error('Expired token');
  if (!Number.isSafeInteger(claims.iat) || claims.iat > now || claims.exp <= claims.iat) throw new Error('Invalid issued time');
  if (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) throw new Error('Token not active');
  return claims;
}
