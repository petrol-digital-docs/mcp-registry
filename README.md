# mcp-registry

Petrol's private **MCP registry** for [GitHub Enterprise Copilot MCP controls](https://github.com/enterprises/petrol/ai-controls/mcp).

`registry.json` is the **source of truth**: a specification-compliant [MCP Registry](https://github.com/modelcontextprotocol/registry) `ServerListResponse` listing the MCP servers approved for use inside Petrol. A small HTTP service (`server.js`) hosts that file over the MCP **v0.1 registry API** so GitHub Enterprise can consume it as an MCP Registry URL.

> **To update the registry, edit `registry.json`.** See **[instructions.md](instructions.md)**.

## What we set up (2026-07-10)

- Added a zero-dependency Node.js service (`server.js`) that serves `registry.json` over the GitHub-required MCP v0.1 endpoints (`/v0.1/servers`, `.../versions/latest`, `.../versions/{version}`) with CORS. Added a `Dockerfile` and the deploy guide **[HOSTING.md](HOSTING.md)**.
- Deployed it to **Petrol's own Azure** as an App Service (Linux, Node 22 LTS):
  - Resource group `rg-petrol-mcp`, app `petrol-mcp-registry`, region `germanywestcentral`, SKU `B1`.
  - Live URL: **`https://petrol-mcp-registry.azurewebsites.net`**
  - `httpsOnly` enabled (HTTP → HTTPS 301 redirect).
- Wired it into **GitHub Enterprise → AI Controls → MCP**:
  - *MCP servers in Copilot* → **Enabled everywhere**
  - *MCP Registry URL* → `https://petrol-mcp-registry.azurewebsites.net`
  - *Restrict MCP access to registry servers* → **Registry only** (only the servers in this registry are allowed org-wide).

`registry.json` was **not** changed by any of this — it is served as-is.

## MCP Registry URL

Set this in GitHub Enterprise Copilot settings (**MCP Registry URL**):

```
https://petrol-mcp-registry.azurewebsites.net
```

Use the service **root** — GitHub appends `/v0.1/...` automatically. Do **not** point GitHub at the raw `registry.json` file: the v0.1 API is path-based (`/v0.1/servers`, `/versions/latest`, ...), which a static file cannot serve.

## Registered servers

| Registry name | Transport | Package / endpoint | Version |
|---|---|---|---|
| `com.petrol/elasticsearch-mcp` | stdio | OCI `docker.elastic.co/mcp/elasticsearch` (podman) | 1.0.0 |
| `com.petrol/postgres-mcp` | stdio | OCI `crystaldba/postgres-mcp` (docker) | 1.0.0 |
| `com.atlassian/mcp` | SSE (remote) | `https://mcp.atlassian.com/v1/sse` | 1.0.0 |
| `com.petrol/gdm-mcp` | stdio | internal `gdm-sap-mcp` (Babashka) | 1.0.0 |
| `io.github.BetterThanTomorrow/calva-backseat-driver` | socket\* | repo metadata only | 1.0.0 |
| `io.github.microsoft/playwright-mcp` | stdio | npm `@playwright/mcp` (npx) | 0.0.1-seed |
| `io.github.vercel/next-devtools-mcp` | stdio | npm `next-devtools-mcp` (npx) | 0.3.6 |
| `io.github.SonarSource/sonarqube-mcp-server` | stdio | OCI `docker.io/mcp/sonarqube` (docker) | 1.7.0 |
| `io.github.upstash/context7` | stdio | npm `@upstash/context7-mcp` (npx) | 1.0.31 |
| `io.npmjs/chrome-devtools-mcp` | stdio | npm `chrome-devtools-mcp` (npx) | 1.0.0 |

## Repository layout

| File | Purpose |
|---|---|
| `registry.json` | **Source of truth.** The MCP `ServerListResponse` served to GitHub. |
| `server.js` | Zero-dependency Node.js service exposing the MCP v0.1 API + CORS. |
| `package.json` | `npm start` → `node server.js`. |
| `Dockerfile` / `.dockerignore` | Container build for Azure. |
| `HOSTING.md` | How to deploy the service (Azure Container Apps / App Service). |
| `instructions.md` | **How to update the registry** and publish the change. |

## Notes

- **`listed` ≠ auto-running.** Appearing in the registry means a server is *allowed and installable*; each developer still needs the relevant runtime (docker/podman, npx/Node, Babashka) and any required secrets (e.g. `ES_API_KEY`, `DATABASE_URI`, `SONARQUBE_TOKEN`) on their machine to actually run it.
- \* `calva-backseat-driver` connects over a TCP socket (`localhost:1664`). The MCP registry spec has no native socket transport type; this entry carries name/metadata only — configure the socket connection in your local `mcp.json`.
- `com.petrol/gdm-mcp` is internal; the `internal` registryType signals it is not downloadable from a public registry.
- Servers pass their required secrets as environment variables at runtime (they are marked `isSecret: true` in `registry.json` and are not stored in the registry).
