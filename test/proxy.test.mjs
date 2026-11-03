import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { createProxy } from '../src/proxy.mjs';
import { settings, signToken, verifyToken } from '../src/jwt.mjs';

const env = {
  JWT_SECRET: 'test-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  JWT_ISSUER: 'http-hw3',
  JWT_AUDIENCE: 'legacy-service'
};
const config = settings(env);
const now = Math.floor(Date.now() / 1000);
const claims = { sub: 'elnaz', iss: config.issuer, aud: config.audience, iat: now, exp: now + 900 };

test('JWT rejects expired, forged, wrong-audience and future tokens', () => {
  assert.equal(verifyToken(signToken(claims, config), config).sub, 'elnaz');
  for (const change of [
    { exp: now - 1 }, { aud: 'other' }, { iss: 'other' },
    { nbf: now + 60 }, { iat: now + 60 }, { exp: '9999999999' }, { sub: '' }
  ]) assert.throws(() => verifyToken(signToken({ ...claims, ...change }, config), config));
  const token = signToken(claims, { ...config, secret: 'wrong' });
  assert.throws(() => verifyToken(token, config));
  const input = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', config.secret).update(input).digest('base64url');
  assert.throws(() => verifyToken(input + '.' + signature, config));
  assert.throws(() => settings({ JWT_SECRET: 'short' }));
});

test('proxy authenticates before forwarding and preserves HTTP data', async t => {
  let hits = 0;
  const legacy = http.createServer(async (req, res) => {
    hits++;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(req.url === '/status/418' ? 418 : 200, { 'content-type': 'application/json', 'x-legacy': 'yes' });
    res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('base64') }));
  });
  legacy.listen(0, '127.0.0.1');
  await once(legacy, 'listening');
  const proxy = createProxy({ ...env, UPSTREAM_URL: 'http://127.0.0.1:' + legacy.address().port });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(async () => {
    await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => legacy.close(resolve))]);
  });
  const origin = 'http://127.0.0.1:' + proxy.address().port;
  for (const authorization of [null, 'Bearer broken', 'Bearer ' + signToken({ ...claims, exp: now - 1 }, config), 'Bearer ' + signToken(claims, { ...config, secret: 'other' })]) {
    const response = await fetch(origin + '/get', { headers: authorization ? { authorization } : {} });
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate'), /Bearer/);
    await response.text();
  }
  assert.equal(hits, 0);
  const authorization = 'Bearer ' + signToken(claims, config);
  const body = Buffer.from([0, 1, 128, 255]);
  const response = await fetch(origin + '/anything?q=a%20b&n=1', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/octet-stream', 'x-authenticated-user': 'admin', 'x-forwarded-for': 'spoofed' },
    body
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-legacy'), 'yes');
  const result = await response.json();
  assert.equal(result.method, 'POST');
  assert.equal(result.url, '/anything?q=a%20b&n=1');
  assert.equal(result.body, body.toString('base64'));
  assert.equal(result.headers.authorization, undefined);
  assert.equal(result.headers['x-authenticated-user'], 'elnaz');
  assert.notEqual(result.headers['x-forwarded-for'], 'spoofed');
  const status = await fetch(origin + '/status/418', { headers: { authorization } });
  assert.equal(status.status, 418);
  await status.text();
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const reply = await fetch(origin + '/anything', { method, headers: { authorization } });
    assert.equal(reply.status, 200);
    await reply.text();
  }
});

test('unavailable upstream returns 502', async t => {
  const stopped = http.createServer();
  stopped.listen(0, '127.0.0.1');
  await once(stopped, 'listening');
  const port = stopped.address().port;
  await new Promise(resolve => stopped.close(resolve));
  const proxy = createProxy({ ...env, UPSTREAM_URL: 'http://127.0.0.1:' + port });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(() => new Promise(resolve => proxy.close(resolve)));
  const response = await fetch('http://127.0.0.1:' + proxy.address().port + '/get', { headers: { authorization: 'Bearer ' + signToken(claims, config) } });
  assert.equal(response.status, 502);
  await response.text();
});
