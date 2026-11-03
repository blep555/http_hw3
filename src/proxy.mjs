import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { settings, verifyToken } from './jwt.mjs';

function cleanHeaders(headers) {
  const result = { ...headers };
  const blocked = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
  for (const name of String(headers.connection || '').split(',')) blocked.push(name.trim().toLowerCase());
  for (const name of blocked) delete result[name];
  return result;
}

function reject(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(status === 401 ? { 'www-authenticate': 'Bearer realm="legacy-service"' } : {})
  });
  res.end(JSON.stringify({ error: message }));
}

export function createProxy(env = process.env) {
  const config = settings(env);
  const upstream = new URL(env.UPSTREAM_URL || 'http://127.0.0.1:8081');
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error('UPSTREAM_URL must be an HTTP or HTTPS origin');
  }
  const transport = upstream.protocol === 'https:' ? https : http;
  const server = http.createServer((req, res) => {
    let claims;
    try {
      const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(req.headers.authorization || '');
      if (!match) throw new Error('Missing bearer token');
      claims = verifyToken(match[1], config);
    } catch {
      return reject(res, 401, 'A valid bearer token is required');
    }
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return reject(res, 400, 'Invalid request target');
    const headers = cleanHeaders(req.headers);
    for (const name of Object.keys(headers)) {
      if (name === 'authorization' || name === 'forwarded' || name.startsWith('x-forwarded-') || name === 'x-authenticated-user') delete headers[name];
    }
    headers.host = upstream.host;
    headers['x-forwarded-for'] = req.socket.remoteAddress;
    headers['x-forwarded-proto'] = 'http';
    headers['x-authenticated-user'] = encodeURIComponent(claims.sub);
    const outgoing = transport.request({
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: req.url,
      headers
    }, incoming => {
      res.writeHead(incoming.statusCode, cleanHeaders(incoming.headers));
      incoming.on('error', () => res.destroy());
      incoming.pipe(res);
    });
    outgoing.setTimeout(15000, () => {
      reject(res, 504, 'Upstream timed out');
      outgoing.destroy();
    });
    outgoing.on('error', () => {
      if (!res.writableEnded) reject(res, 502, 'Upstream unavailable');
    });
    req.on('aborted', () => outgoing.destroy());
    req.on('error', () => outgoing.destroy());
    res.on('close', () => outgoing.destroy());
    req.pipe(outgoing);
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.on('upgrade', (req, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createProxy();
  server.listen(Number(process.env.PORT || 80), process.env.HOST || '0.0.0.0', () => {
    console.log('Proxy listening on port ' + server.address().port);
  });
  server.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
