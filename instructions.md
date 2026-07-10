# Updating the MCP registry

**Golden rule:** `registry.json` is the source of truth. To add, change, or remove an MCP server, **edit `registry.json`, merge to `master`, then publish** (see [Publishing a change](#publishing-a-change)).

Do **not** hand-edit anything on the Azure server. Everything flows from this repo.

---

## How the data flows

```
registry.json  ──►  server.js (MCP v0.1 API)  ──►  GitHub Enterprise (MCP Registry URL)
   (this repo)         (Azure App Service)            reads /v0.1/servers
```

The running service can get `registry.json` in one of two ways. **Which one you use decides whether a code change needs an Azure redeploy:**

| Mode | How it reads the file | To publish an update |
|---|---|---|
| **Bundled** *(current)* | The `registry.json` baked into the deployed build | **Redeploy** the service (Option A below) |
| **Live-from-Git** *(optional)* | Fetches a `REGISTRY_URL` on a timer (`REGISTRY_TTL_SECONDS`, default 300s) | **Just merge to `master`** — no redeploy (Option B below) |

Today we run in **Bundled** mode, so a registry change is only live after a redeploy. If you'd rather updates go live automatically on merge, switch to Live-from-Git once (Option B) and you can skip the redeploy from then on.

---

## 1. Edit `registry.json`

Each server is one object in the top-level `servers` array, shaped as `{ "server": {...}, "_meta": {...} }`.

### Add a new server

Append an entry. Minimal template (stdio server from an npm package):

```json
{
  "server": {
    "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    "name": "io.github.acme/my-mcp",
    "title": "My MCP",
    "description": "One-line description of what it does",
    "version": "1.0.0",
    "repository": { "url": "https://github.com/acme/my-mcp", "source": "github" },
    "packages": [
      {
        "registryType": "npm",
        "identifier": "@acme/my-mcp",
        "transport": { "type": "stdio" },
        "runtimeHint": "npx",
        "environmentVariables": [
          { "name": "MY_API_KEY", "description": "API key", "isRequired": true, "isSecret": true }
        ]
      }
    ]
  },
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "status": "active",
      "statusChangedAt": "2026-07-10T00:00:00Z",
      "publishedAt": "2026-07-10T00:00:00Z",
      "updatedAt": "2026-07-10T00:00:00Z",
      "isLatest": true
    }
  }
}
```

Field guide:

- **`name`** — reverse-DNS unique id (`com.petrol/...`, `io.github.<org>/<repo>`, `io.npmjs/<pkg>`). Must be unique per version.
- **Transport / delivery** — use exactly one of:
  - `packages` for locally-run servers: `registryType` = `npm` / `oci` / `internal`; `transport.type` = `stdio`; `runtimeHint` = `npx` / `docker` / `podman` / `bb`.
  - `remotes` for hosted servers: `[{ "type": "sse" | "streamable-http", "url": "https://..." }]`.
- **Secrets** — declare them as `environmentVariables` with `isSecret: true`. **Never put secret values in `registry.json`** — developers supply them locally at runtime.
- **`_meta` official block** — keep `status: "active"` and `isLatest: true` for a server's current version; timestamps are ISO-8601 UTC.

Then bump the count at the bottom of the file:

```json
"metadata": { "count": 11 }
```

### Update an existing server's version

Two options:

- **In place (simplest):** bump `server.version`, update the package `version`/`identifier`, and set `_meta ... updatedAt` to today.
- **Keep history:** add a *second* entry with the same `name` and the new `version`; set the old entry's `_meta ... isLatest` to `false` and the new one's to `true`. The service resolves `/versions/latest` to the entry with `isLatest: true`.

### Remove / deprecate a server

- **Remove:** delete its object from `servers` and decrement `metadata.count`.
- **Deprecate but keep listed:** set `_meta ... status` to `"deprecated"`.

---

## 2. Validate before you commit

```powershell
# JSON is valid and count matches the number of entries:
node -e "const r=require('./registry.json'); if(r.metadata.count!==r.servers.length) throw new Error('count '+r.metadata.count+' != servers '+r.servers.length); console.log('OK:', r.servers.length, 'servers')"

# Optional: run the service locally and eyeball it
node server.js
# in another shell:
curl http://localhost:8080/v0.1/servers
```

Common mistakes: trailing commas, `metadata.count` not matching the number of servers, duplicate `name`+`version`, or a secret value pasted into the file.

---

## 3. Commit via a PR to `master`

```powershell
git checkout -b update-registry-<short-desc>
git add registry.json
git commit -m "Update registry: <what changed>"
git push -u origin update-registry-<short-desc>
gh pr create --base master --fill
```

Merge the PR once reviewed. `master` stays the source of truth.

---

## Publishing a change

### Option A — Redeploy (current / bundled mode)

The App Service serves the `registry.json` from the **last deployed build**, so after merging you must redeploy the current files. `az webapp up` remembers the settings from the first deploy, so from the repo root:

```powershell
# 1. Get the merged registry locally
git checkout master
git pull

# 2. Redeploy the current directory to Azure (defaults were saved on first deploy)
az webapp up --name petrol-mcp-registry --resource-group rg-petrol-mcp --runtime "NODE:22-lts"
```

> `az webapp up` zips **the current working directory** — always `git pull master` first so you deploy the merged `registry.json`, not a stale local copy.

### Option B — No redeploy (switch to live-from-Git, one-time setup)

Point the service at `registry.json` in Git; it re-fetches on a timer, so future updates go live shortly after merge with **no redeploy**. Configure once:

```powershell
az webapp config appsettings set -g rg-petrol-mcp -n petrol-mcp-registry --settings `
  REGISTRY_URL="https://raw.githubusercontent.com/petrol-digital-docs/mcp-registry/master/registry.json" `
  REGISTRY_TTL_SECONDS="300"
```

Notes:
- If the repo is **private**, the raw URL isn't publicly fetchable — also set `REGISTRY_AUTH_HEADER` to a token the service can send (e.g. `--settings REGISTRY_AUTH_HEADER="Bearer <PAT>"`) and use a URL the token authorizes. Test with `curl` from the app before relying on it.
- On a fetch failure the service serves the last good copy, then falls back to the bundled file, so a bad URL won't take the registry down — but it also means a silent misconfig keeps serving stale data. Verify after switching.
- After this, publishing = merge to `master` and wait up to `REGISTRY_TTL_SECONDS`.

---

## Verify it's live

```powershell
$base = "https://petrol-mcp-registry.azurewebsites.net"
curl.exe -s "$base/v0.1/servers" | ConvertFrom-Json | % { $_.metadata.count }   # matches your new count
curl.exe -s "$base/healthz"                                                      # {"status":"ok"}
curl.exe -s "$base/v0.1/servers/io.github.acme%2Fmy-mcp/versions/latest"         # your new server
```

Give GitHub a few minutes to re-read the registry after the service updates. New servers then appear in supported Copilot editors for the org (subject to the *Registry only* restriction).
