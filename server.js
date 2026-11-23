const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const { realpathSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = 8080;
const LOCAL_ADDRESS = '127.0.0.1';
const ROOT = realpathSync(__dirname);
const LOCAL_ADDRESSES = new Set([LOCAL_ADDRESS, '::1', '::ffff:127.0.0.1']);
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i;
const SAFE_SEGMENT = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.gpx': 'application/gpx+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.stl': 'model/stl',
  '.3mf': 'model/3mf',
};

const PUBLIC_FILES = new Set([
  'index.html',
  'style.css',
  'przelecz-gorska.gpx',
  'grafika/index.html',
  'grafika/kinematyka.js',
  'grafika/kolarz.glb',
  'grafika/kolarz.js',
  'grafika/modele.json',
  'grafika/studio.css',
  'grafika/studio.js',
  'grafika/kibice/modele.json',
  'grafika/marka-oskiride/paleta.html',
  'grafika/marka-oskiride/oskiride-logo.png',
  'grafika/marka-oskiride/druk-3d/podglad.html',
  'grafika/marka-oskiride/druk-3d/pionowe-20mm/podglad.html',
  'grafika/marka-oskiride/druk-3d/kontur-20mm/podglad.html',
  'tools/3d/node_modules/three/build/three.module.js',
  'tools/3d/node_modules/three/examples/jsm/controls/OrbitControls.js',
  'tools/3d/node_modules/three/examples/jsm/loaders/STLLoader.js',
]);

const PUBLIC_ASSETS = [
  /^src\/(?:[^/]+\/)*[^/]+\.(?:css|js)$/,
  /^grafika\/vendor\/(?:[^/]+\/)*[^/]+\.js$/,
  /^grafika\/kolarz-0[1-4]-[a-z-]+\.glb$/,
  /^grafika\/kibice\/(?:0[1-9]|1[0-2])-[a-z-]+\.glb$/,
  /^grafika\/slonce-i-las\/[a-z-]+\.(?:png|svg)$/,
  /^grafika\/marka-oskiride\/(?:base|theme|tokens)\.css$/,
  /^grafika\/marka-oskiride\/oskiride-icon\.(?:ico|png|svg)$/,
  /^grafika\/marka-oskiride\/druk-3d\/(?:[^/]+\/)*(?:[^/]+\.(?:stl|3mf)|walidacja\.json)$/,
];

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'bluetooth=(self), camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function selectPublicFile(url) {
  const [rawPath] = url.split('?', 1);
  if (!rawPath.startsWith('/')) return null;
  if (rawPath === '/') return 'index.html';
  if (rawPath === '/grafika/') return 'grafika/index.html';
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  const segments = decodedPath.slice(1).split('/');
  if (!segments.every(segment => SAFE_SEGMENT.test(segment))) return null;
  const publicPath = segments.join('/');
  return PUBLIC_FILES.has(publicPath) || PUBLIC_ASSETS.some(rule => rule.test(publicPath))
    ? publicPath
    : null;
}

function isLocalRequest(req) {
  const { host, origin } = req.headers;
  return LOCAL_ADDRESSES.has(req.socket.remoteAddress)
    && LOCAL_HOST.test(host ?? '')
    && (origin === undefined || origin === 'http://' + host)
    && (req.headers['sec-fetch-site'] !== 'cross-site' || req.headers['sec-fetch-mode'] === 'navigate');
}

function htmlPolicy(data) {
  const inlineHashes = [];
  const scripts = data.toString('utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
  for (const [, attributes, script] of scripts) {
    if (!script.trim() || /\bsrc\s*=/i.test(attributes)) continue;
    // HTML parsing normalizes line endings before the browser hashes inline code.
    const hash = createHash('sha256').update(script.replace(/\r\n?/g, '\n')).digest('base64');
    inlineHashes.push("'sha256-" + hash + "'");
  }
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "connect-src 'self' blob:",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    ["script-src 'self'", ...inlineHashes].join(' '),
  ].join('; ');
}

function reply(req, res, status, data, headers = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

function createOskiRideServer() {
  return http.createServer(async (req, res) => {
    if (!isLocalRequest(req)) {
      reply(req, res, 403, 'Forbidden');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      reply(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }
    const publicFile = selectPublicFile(req.url);
    if (!publicFile) {
      reply(req, res, 404, 'Not found');
      return;
    }
    const filePath = path.join(ROOT, publicFile);
    let data;
    try {
      // Refuse symbolic links and junctions, including links into other workspace directories.
      if (await fs.realpath(filePath) === filePath) data = await fs.readFile(filePath);
    } catch {
      // The resource may be unavailable in this checkout.
    }
    if (data === undefined) {
      reply(req, res, 404, 'Not found');
      return;
    }
    const extension = path.extname(publicFile);
    const headers = { 'Content-Type': MIME[extension] };
    if (extension === '.html') headers['Content-Security-Policy'] = htmlPolicy(data);
    reply(req, res, 200, data, headers);
  });
}

if (require.main === module) {
  createOskiRideServer().listen(PORT, LOCAL_ADDRESS, () => {
    console.log('OskiRide 3D is running at http://localhost:' + PORT);
  });
}

module.exports = { createOskiRideServer };
