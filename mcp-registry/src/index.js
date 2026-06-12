import REGISTRY from "../../registry.json";

const ENTRIES = REGISTRY.servers;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/") {
      return json({
        message: "MCP registry is running",
        registryBaseUrl: url.origin,
        endpoints: [
          "/v0.1/servers",
          "/v0.1/servers/{serverName}/versions",
          "/v0.1/servers/{serverName}/versions/latest",
          "/v0.1/servers/{serverName}/versions/{version}"
        ]
      });
    }

    if (path === "/v0.1/health") {
      return json({ status: "ok" });
    }

    if (path === "/v0.1/servers") {
      const servers = latestEntries();

      return json({
        servers,
        metadata: {
          count: servers.length,
          nextCursor: null
        }
      });
    }

    const versionsMatch = path.match(
      /^\/v0\.1\/servers\/(.+)\/versions$/
    );

    if (versionsMatch) {
      const serverName = decodeURIComponent(versionsMatch[1]);
      const servers = ENTRIES.filter(
        entry => entry.server && entry.server.name === serverName
      );

      return json({
        servers,
        metadata: {
          count: servers.length,
          nextCursor: null
        }
      });
    }

    const detailMatch = path.match(
      /^\/v0\.1\/servers\/(.+)\/versions\/([^/]+)$/
    );

    if (detailMatch) {
      const serverName = decodeURIComponent(detailMatch[1]);
      const requestedVersion = decodeURIComponent(detailMatch[2]);

      const entry =
        requestedVersion === "latest"
          ? latestFor(serverName)
          : ENTRIES.find(
              item =>
                item.server &&
                item.server.name === serverName &&
                item.server.version === requestedVersion
            );

      if (!entry) {
        return json({ error: "Server version not found" }, 404);
      }

      return json(entry);
    }

    return json({ error: "Not found" }, 404);
  }
};

function latestEntries() {
  const byName = new Map();

  for (const entry of ENTRIES) {
    if (!entry.server || !entry.server.name) continue;

    const existing = byName.get(entry.server.name);

    if (
      !existing ||
      compareVersions(entry.server.version, existing.server.version) > 0
    ) {
      byName.set(entry.server.name, entry);
    }
  }

  return Array.from(byName.values()).map(markLatest);
}

function latestFor(serverName) {
  const matches = ENTRIES.filter(
    entry => entry.server && entry.server.name === serverName
  );

  if (matches.length === 0) return null;

  return matches.sort((a, b) =>
    compareVersions(a.server.version, b.server.version)
  )[matches.length - 1];
}

function markLatest(entry) {
  const officialMeta =
    entry._meta?.["io.modelcontextprotocol.registry/official"] || {};

  return {
    ...entry,
    _meta: {
      ...(entry._meta || {}),
      "io.modelcontextprotocol.registry/official": {
        status: officialMeta.status || "active",
        ...officialMeta,
        isLatest: true
      }
    }
  };
}

function compareVersions(a, b) {
  const left = String(a || "0").replace(/^v/, "").split(/[.-]/);
  const right = String(b || "0").replace(/^v/, "").split(/[.-]/);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const x = left[i] || "0";
    const y = right[i] || "0";
    const nx = Number(x);
    const ny = Number(y);

    if (Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny) {
      return nx - ny;
    }

    const textCompare = x.localeCompare(y, undefined, {
      numeric: true,
      sensitivity: "base"
    });

    if (textCompare !== 0) return textCompare;
  }

  return 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: CORS_HEADERS
  });
}