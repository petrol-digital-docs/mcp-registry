# Petrol MCP Registry service

Serves the existing `registry.json` over the GitHub-required **MCP v0.1 registry HTTP API**,
with CORS, so it can be used as the **MCP Registry URL** in GitHub Enterprise AI Controls.
Runs entirely in **your own Azure** (no third-party hosting).

It is a tiny zero-dependency Node.js service. `registry.json` stays your source of truth —
edit it in Git as you do today.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/v0.1/servers` | List of all servers `{ servers: [...], metadata: { count } }` |
| GET | `/v0.1/servers/{serverName}/versions` | Versions of one server |
| GET | `/v0.1/servers/{serverName}/versions/latest` | Latest version (single `{ server, _meta }`) |
| GET | `/v0.1/servers/{serverName}/versions/{version}` | Specific version (single `{ server, _meta }`) |
| GET | `/healthz` | `{ "status": "ok" }` |

`serverName` may be URL-encoded (`com.petrol%2Felasticsearch-mcp`) or raw — both work.
CORS (`Access-Control-Allow-Origin: *`, `GET, OPTIONS`, `Authorization, Content-Type`) is sent on every response.

> GitHub Copilot **appends `/v0.1/...` automatically**. The URL you put in GitHub is this
> service's **root** — do NOT include `/v0.1/servers`.

## Data source

- **Default:** the bundled `registry.json` (redeploy to publish changes).
- **Live-from-Git (keeps your workflow):** set `REGISTRY_URL` to your raw file URL so edits
  in the repo go live without a redeploy:
  - `REGISTRY_URL=https://raw.githubusercontent.com/petrol-digital-docs/mcp-registry/master/registry.json`
  - `REGISTRY_AUTH_HEADER` (optional, e.g. `Bearer <token>`) if the repo is private.
  - `REGISTRY_TTL_SECONDS` cache lifetime (default `300`). On fetch failure it serves the last
    good copy, then falls back to the bundled file.

## Run locally

```bash
node server.js
# or: npm start
curl http://localhost:8080/v0.1/servers
```

## Deploy to Azure — Option 1: Azure Container Apps (recommended)

Builds the image from the Dockerfile, hosts it, and gives you an HTTPS URL. No servers to manage.

```bash
az login
az extension add --name containerapp --upgrade

# From this folder (contains Dockerfile, server.js, registry.json):
az containerapp up \
  --name petrol-mcp-registry \
  --resource-group rg-mcp-registry \
  --location westeurope \
  --source . \
  --ingress external \
  --target-port 8080
```

The command prints an HTTPS FQDN like:

```
https://petrol-mcp-registry.<hash>.westeurope.azurecontainerapps.io
```

That FQDN (root) is your registry URL.

- `--ingress external` = reachable over the public internet (simplest; required if off-network
  developers or the Copilot cloud agent must reach it). Use `internal` only if all consumers are
  inside your VNet/corp network — note the Copilot **cloud** agent then can't reach it.
- To switch to live-from-Git later:
  `az containerapp update -n petrol-mcp-registry -g rg-mcp-registry --set-env-vars REGISTRY_URL=<raw-url>`

### Option 2: Azure App Service (container)

```bash
# Build & push to your Azure Container Registry (ACR)
az acr build --registry <youracr> --image petrol-mcp-registry:1 .

az webapp create \
  --resource-group rg-mcp-registry \
  --plan <your-app-service-plan> \
  --name petrol-mcp-registry \
  --deployment-container-image-name <youracr>.azurecr.io/petrol-mcp-registry:1
# App Service provides HTTPS at https://petrol-mcp-registry.azurewebsites.net
```

Set `WEBSITES_PORT=8080` on the Web App if needed.

## Point GitHub at it

Enterprise **AI Controls → MCP**:

1. **MCP servers in Copilot** → *Enabled everywhere*.
2. **MCP Registry URL** → paste the service **root** URL (no `/v0.1/...` suffix) → **Save**.
3. **Restrict MCP access to registry servers** → *Registry only* (or *Allow all*).

## Verify

```bash
BASE=https://petrol-mcp-registry.<hash>.westeurope.azurecontainerapps.io
curl "$BASE/v0.1/servers" | jq '.metadata.count'                      # -> 10
curl "$BASE/v0.1/servers/com.petrol%2Felasticsearch-mcp/versions/latest" | jq '.server.name'
curl -i "$BASE/v0.1/servers" | grep -i access-control-allow-origin    # -> *
```
