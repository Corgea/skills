---
name: corgea-mcp
description: Connect an agent to Corgea's hosted MCP server and query security data - scans, security issues, SCA and IaC findings, code quality issues, dependency inventory, and blocking rules. Use when asked to set up Corgea MCP in Cursor or Claude Desktop, look up what vulnerabilities a scan found, check whether a dependency is vulnerable or reachable, prioritise findings by severity, or check which blocking rules would fail a deployment.
---

# Corgea MCP

Read access to Corgea security data over the Model Context Protocol. Corgea
hosts the server; there is nothing to install or run.

**MCP reads, it does not act.** To run a scan or apply a fix, use the
`corgea-scan` skill, which drives the Corgea CLI. The two are complementary:
MCP answers "what did we find", the CLI does something about it.

Full reference: [Corgea MCP docs](https://docs.corgea.app/modelcontextprotocol).

## Connect

Endpoint:

```
https://www.corgea.app/mcp
```

Single-tenant deployments use `https://<your-instance>.corgea.app/mcp`.

Authenticate with an API token from Settings, API Keys in the Corgea app,
passed in the **`CORGEA-TOKEN`** header. Not `Authorization` — that is the most
common setup mistake.

Requests are stateless POST with JSON responses. Standalone SSE streams are not
supported, so a client configured for SSE-only transport will fail to connect.

There is no shared syntax for referring to a secret from a client config. Each
block below is written for one client, and moving one to another client does
not fail loudly: the placeholder is either sent as the token or resolves to
nothing, and both come back as a `401`.

Note also the missing space after `CORGEA-TOKEN:` in the `--header` arguments.
Cursor and Claude Desktop on Windows do not escape spaces inside `args`, so a
header written the natural way arrives mangled.

### Cursor

Add to `~/.cursor/mcp.json` (macOS and Linux) or `%APPDATA%\Cursor\User\mcp.json`
(Windows). Cursor resolves `${env:NAME}` in `args`, `env`, `url` and `headers`,
so the token can stay in your shell and out of the file:

```json
{
  "mcpServers": {
    "corgea": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.corgea.app/mcp",
        "--header",
        "CORGEA-TOKEN:${env:CORGEA_TOKEN}"
      ]
    }
  }
}
```

Cursor substitutes from its own environment, so a GUI launch on macOS may not
see `export CORGEA_TOKEN=...` added to a shell profile until Cursor is
restarted. If the header arrives empty, check that first.

### Claude Desktop

Under Settings, Developer, Edit Config. Claude Desktop does not interpolate
config values. What resolves `${CORGEA_TOKEN}` here is `mcp-remote` itself,
which substitutes `${NAME}` in a header from its own `process.env` — and the
`env` block is what puts the value there:

```json
{
  "mcpServers": {
    "corgea": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.corgea.app/mcp",
        "--header",
        "CORGEA-TOKEN:${CORGEA_TOKEN}"
      ],
      "env": {
        "CORGEA_TOKEN": "your token"
      }
    }
  }
}
```

Cursor's `${env:CORGEA_TOKEN}` would not fail loudly here: `mcp-remote` reads
whatever is between the braces as the variable name, finds nothing called
`env:CORGEA_TOKEN`, and sends the header empty, logging
`Warning: Environment variable 'env:CORGEA_TOKEN' not found` to stderr. A `401`
with an empty `CORGEA-TOKEN` is that mistake.

This file lives in your user profile rather than a repository, which is what
makes writing the token in it tolerable — so keep it out of any dotfiles repo,
and prefer a token scoped to one machine. Restart Claude Desktop fully
afterwards.

### Clients supporting direct HTTP

Anything speaking streamable HTTP can skip the `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "corgea": {
      "url": "https://www.corgea.app/mcp",
      "headers": { "CORGEA-TOKEN": "${env:CORGEA_TOKEN}" }
    }
  }
}
```

The `${env:...}` shown is Cursor's spelling. Claude Code uses `${VAR}`, other
clients differ again, and a client with no interpolation at all needs the
variable set in the environment it is launched from.

## Tools

Scans:

- `list_scans` — filter by `project`, `repo`, `branch`, `pull_request_id`
- `get_scan_info` — one scan by `scan_id`

Security issues (SAST):

- `list_security_issues` — filter by `scan_id`, `project`, `repo`; set
  `include_reachability` for an endpoint reachability summary per issue
- `get_issue_info` — one issue by `issue_id`, including the fix recommendation

Dependencies (SCA):

- `list_sca_security_issues` — filter by `severity`, `package`, `ecosystem`,
  `cve`, `has_fix`, `reachability`
- `get_sca_issue_info` — one SCA issue, with package, CVE, fix version, and
  reachability
- `list_dependencies` — full inventory with version, purl, licence, and whether
  the dependency is direct

Other:

- `list_iac_security_issues` — Terraform and other IaC findings, filterable by
  `provider`, `service`, `iac_type`, `rule_id`
- `list_code_quality_issues` — quality findings, kept separate from security
  ones. Their `classification` holds a label such as `Maintainability` rather
  than a CWE, and false positives are excluded by default
- `get_blocking_rules` — the policies that would block a deployment

### Choosing a tool

Start from a `list_*` call to find the ID, then a `get_*` call for detail. Going
straight to `get_issue_info` requires an ID the user rarely has to hand.

Reachability is the field worth reaching for when prioritising. An SCA issue
whose `reachability` is `vulnerable_usage_unreachable` is real but not
exploitable in this codebase, and should not outrank a reachable medium.
Supported values are `vulnerable_usage_reachable`,
`vulnerable_usage_unreachable`, `not_direct_dependency`, `dead_dependency`,
and `pending`.

## Filtering and limits

Paginated tools cap `page_size` at 50. Filter server-side with `project`,
`repo`, `branch` or `severity` rather than pulling pages and discarding them.

Rate limits are 100 requests per minute and 1000 per hour per token, returned
as `429`. Batch with `list_*` calls instead of looping `get_*` per issue.

## Responses

```json
{ "status": "ok", "data": {} }
```

Errors return `status: "error"` with `message` and `error`. A `401` means the
token is wrong, expired, or sent in the wrong header — check `CORGEA-TOKEN`
before anything else. Empty results usually mean the filter did not match: try
without `scan_id` or `project` to confirm data exists.

## Token handling

The token grants read access to every finding in the account. Keep it in an
environment variable or a secret manager, never in a committed config file, and
revoke it in the Corgea app if it leaks. This applies with most force to a
project-local `.cursor/mcp.json`, which is the copy that gets committed by
accident.
