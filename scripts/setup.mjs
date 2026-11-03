import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

try {
  writeFileSync('.env', [
    'JWT_SECRET=' + randomBytes(48).toString('base64url'),
    'JWT_ISSUER=http-hw3',
    'JWT_AUDIENCE=legacy-service',
    'UPSTREAM_URL=http://127.0.0.1:8081',
    'HOST=0.0.0.0',
    'PORT=80',
    ''
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Created .env');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; kept unchanged');
}
