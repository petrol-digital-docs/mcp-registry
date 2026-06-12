# mcp-registry

Petrol MCP registry allowlist — a specification-compliant [MCP Registry](https://github.com/modelcontextprotocol/registry) for use with [GitHub Copilot Enterprise MCP controls](https://github.com/enterprises/petrol/ai-controls/mcp).

## Usage

Set the **MCP Registry URL** in your GitHub Enterprise Copilot settings to:

```
https://raw.githubusercontent.com/petrol-digital-docs/mcp-registry/main/registry.json
```

This registry file (`registry.json`) follows the [MCP Registry v0 `ServerListResponse`](https://registry.modelcontextprotocol.io/docs) format.

## Registered servers

| Registry name | Type | Description |
|---|---|---|
| `com.petrol/postgres-mcp` | stdio (OCI) | PostgreSQL via `crystaldba/postgres-mcp` Docker image |
| `com.atlassian/mcp` | SSE (remote) | Atlassian cloud MCP (`https://mcp.atlassian.com/v1/sse`) |
| `com.petrol/gdm-mcp` | stdio (internal) | Internal GDM SAP MCP server (Babashka) |
| `io.github.BetterThanTomorrow/calva-backseat-driver` | socket | Calva Clojure/ClojureScript assistant |
| `io.github.microsoft/playwright-mcp` | stdio (npm) | Playwright browser automation |
| `io.github.vercel/next-devtools-mcp` | stdio (npm) | Next.js DevTools, v0.3.6 |
| `io.github.SonarSource/sonarqube-mcp-server` | stdio (OCI) | SonarQube code quality, v1.7.0 |
| `io.github.upstash/context7` | stdio (npm) | Context7 library docs, v1.0.31 |

## Notes

- `calva-backseat-driver` connects over a TCP socket (`localhost:1664`). The MCP registry spec has no native socket transport type; this entry carries name/metadata only — configure the socket connection in your local `mcp.json`.
- `com.petrol/gdm-mcp` is an internal server (`bb server` in `/home/ssitje/workspace/gdm/gdm-sap/mcp`); the `internal` registryType signals it is not downloadable from a public registry.
- `com.petrol/postgres-mcp` passes the `DATABASE_URI` environment variable to the container. The default URI used internally is `postgresql://@cic:5432/gdm`.

