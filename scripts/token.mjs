import { settings, signToken } from '../src/jwt.mjs';

const sub = process.argv[2] || 'elnaz';
const lifetime = Number(process.argv[3] || 900);
if (!sub.trim() || !Number.isInteger(lifetime) || lifetime < 1 || lifetime > 3600) {
  throw new Error('Usage: token.mjs [subject] [lifetime: 1..3600 seconds]');
}
const config = settings();
const now = Math.floor(Date.now() / 1000);
console.log(signToken({ sub, iss: config.issuer, aud: config.audience, iat: now, exp: now + lifetime }, config));
