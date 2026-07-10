'use strict';

/*
 * Petrol MCP Registry service.
 *
 * Serves the existing registry.json over the GitHub-required MCP v0.1 registry
 * HTTP API, with CORS. GitHub Copilot appends the /v0.1 path automatically, so
 * the base URL you configure in GitHub is this service's root.
 *
 * Endpoints:
 *   GET /v0.1/servers                                   -> list all servers
 *   GET /v0.1/servers/{serverName}/versions            -> list versions of a server
 *   GET /v0.1/servers/{serverName}/versions/latest     -> latest version (single)
 *   GET /v0.1/servers/{serverName}/versions/{version}  -> specific version (single)
 *   GET /healthz                                        -> health probe
 *
 * Data source:
 *   - Default: the bundled ./registry.json (redeploy to update).
 *   - Optional: set REGISTRY_URL to fetch live (e.g. your GitHub raw URL) so
 *     editing registry.json in Git updates the registry without a redeploy.
 *     REGISTRY_AUTH_HEADER (e.g. "Bearer <token>") is sent if the source is private.
 *     REGISTRY_TTL_SECONDS controls the in-memory cache (default 300).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8080', 10);
const REGISTRY_URL = process.env.REGISTRY_URL || '';
const REGISTRY_AUTH = process.env.REGISTRY_AUTH_HEADER || '';
const TTL_MS = parseInt(process.env.REGISTRY_TTL_SECONDS || '300', 10) * 1000;
const BUNDLED = path.join(__dirname, 'registry.json');
const OFFICIAL_META = 'io.modelcontextprotocol.registry/official';

let cache = { at: 0, servers: [] };

function normalize(json) {
  const servers = Array.isArray(json)
    ? json
    : (json && Array.isArray(json.servers) ? json.servers : []);
  return servers.filter(function (e) {
    return e && e.server && typeof e.server.name === 'string';
  });
}

function loadBundled() {
  try {
    return normalize(JSON.parse(fs.readFileSync(BUNDLED, 'utf8')));
  } catch (e) {
    console.error('Failed to read bundled registry.json:', e.message);
    return [];
  }
}

async function fetchRemote() {
  const headers = { Accept: 'application/json' };
  if (REGISTRY_AUTH) headers.Authorization = REGISTRY_AUTH;
  const r = await fetch(REGISTRY_URL, { headers });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return normalize(await r.json());
}

async function getServers() {
  if (!REGISTRY_URL) {
    if (cache.servers.length === 0) cache.servers = loadBundled();
    return cache.servers;
  }
  const now = Date.now();
  if (cache.servers.length && now - cache.at < TTL_MS) return cache.servers;
  try {
    const servers = await fetchRemote();
    cache = { at: now, servers: servers };
    return servers;
  } catch (e) {
    console.error('Remote registry fetch failed:', e.message);
    if (cache.servers.length) return cache.servers; // serve stale on failure
    return loadBundled(); // last-resort fallback
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sendJson(res, status, obj) {
  setCors(res);
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function notFound(res, detail) {
  sendJson(res, 404, { title: 'Not Found', status: 404, detail: detail || 'Resource not found' });
}

function official(entry) {
  return (entry._meta && entry._meta[OFFICIAL_META]) || {};
}

function pickLatest(matches) {
  return matches.find(function (e) { return official(e).isLatest === true; })
    || matches[matches.length - 1]
    || null;
}

const server = http.createServer(async function (req, res) {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    return notFound(res, 'Bad URL');
  }

  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    return res.end();
  }

  if (pathname === '/healthz' || pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { title: 'Method Not Allowed', status: 405 });
  }

  if (pathname === '/') {
    return sendJson(res, 200, {
      name: 'petrol-mcp-registry',
      spec: 'mcp-registry v0.1',
      endpoints: [
        '/v0.1/servers',
        '/v0.1/servers/{serverName}/versions',
        '/v0.1/servers/{serverName}/versions/latest',
        '/v0.1/servers/{serverName}/versions/{version}'
      ]
    });
  }

  if (pathname === '/v0.1/servers') {
    const servers = await getServers();
    return sendJson(res, 200, { servers: servers, metadata: { count: servers.length } });
  }

  const prefix = '/v0.1/servers/';
  if (pathname.startsWith(prefix)) {
    const rest = pathname.slice(prefix.length);
    const marker = '/versions';
    const vi = rest.indexOf(marker);
    if (vi === -1) return notFound(res, 'Missing /versions in path');

    const name = decodeURIComponent(rest.slice(0, vi));
    let after = rest.slice(vi + marker.length); // '', '/', '/latest', '/1.0.0', ...

    const servers = await getServers();
    const matches = servers.filter(function (e) { return e.server.name === name; });
    if (matches.length === 0) return notFound(res, 'Unknown server: ' + name);

    if (after === '' || after === '/') {
      return sendJson(res, 200, { servers: matches, metadata: { count: matches.length } });
    }

    if (after.startsWith('/')) after = after.slice(1);
    if (after.indexOf('/') !== -1) return notFound(res, 'Unsupported subresource');

    const version = decodeURIComponent(after);
    const entry = version === 'latest'
      ? pickLatest(matches)
      : (matches.find(function (e) { return e.server.version === version; }) || null);

    if (!entry) return notFound(res, 'Unknown version: ' + version);
    return sendJson(res, 200, entry); // ServerResponse: { server, _meta }
  }

  return notFound(res, 'No route');
});

server.listen(PORT, function () {
  console.log('Petrol MCP registry listening on :' + PORT +
    (REGISTRY_URL ? ' (source: ' + REGISTRY_URL + ')' : ' (source: bundled registry.json)'));
});
