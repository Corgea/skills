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

Put the token in the environment first, not in the config file:

```bash
export CORGEA_TOKEN="..."   # in ~/.zshrc, ~/.bashrc, or a secret manager
```

### Cursor

Add to `~/.cursor/mcp.json` (macOS and Linux) or `%APPDATA%\Cursor\User\mcp.json`
(Windows). `${env:NAME}` is Cursor's interpolation syntax and is resolved in
`args`, `env`, `url` and `headers`:

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
        "CORGEA-TOKEN: ${env:CORGEA_TOKEN}"
      ]
    }
  }
}
```

Cursor reads the variable from its own environment, so a GUI-launched Cursor on
macOS may not see an export added to a shell profile until it is restarted. If
the header arrives empty, that is the first thing to check.

### Claude Desktop

Same block, added under Settings, Developer, in the MCP configuration file.
Restart Claude Desktop afterwards.

### Clients supporting direct HTTP

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

Interpolation syntax belongs to the client, not to MCP — `${env:NAME}` is
Cursor's. Check what the client in front of you supports, and if it has none,
launch it with the variable already set rather than pasting the token in.

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
