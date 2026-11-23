const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { createOskiRideServer } = require('../../server.js');

let server;
let port;

before(async () => {
  server = createOskiRideServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, ...options }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves the ride, Studio and bundled resources', async () => {
  for (const path of [
    '/?view=ride',
    '/style.css',
    '/src/main.js?v=1',
    '/grafika/',
    '/grafika/studio.js',
    '/grafika/kibice/modele.json',
    '/grafika/marka-oskiride/druk-3d/podglad.html',
    '/przelecz-gorska.gpx',
  ]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.ok(response.body.length > 0, path);
  }
});

test('HEAD and GET expose security headers without caching', async () => {
  const response = await request('/', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 0);
  assert.ok(Number(response.headers['content-length']) > 0);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cross-origin-resource-policy'], 'same-origin');
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.match(response.headers['content-security-policy'], /script-src 'self' 'sha256-/);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
});

test('keeps local files outside the public resource set', async () => {
  for (const path of [
    '/package.json',
    '/.git/config',
    '/AGENTS.md',
    '/grafika/marka-oskiride/prompt-logo.txt',
    '/node_modules/electron/package.json',
  ]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body.toString(), 'Not found', path);
  }
});

test('accepts matching local origins and rejects external hosts and origins', async () => {
  const host = 'localhost:' + port;
  const origin = 'http://' + host;
  assert.equal((await request('/', { headers: { host, origin } })).status, 200);
  assert.equal((await request('/', { headers: { host: 'example.invalid' } })).status, 403);
  assert.equal((await request('/', { headers: { host, origin: 'https://example.invalid' } })).status, 403);
});

test('limits the server to read-only methods', async () => {
  const response = await request('/', { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
});
