---
name: corgea-mcp
description: Connect an agent to Corgea's hosted MCP server and query security data - scans, security issues, SCA and IaC findings, code quality issues, dependency inventory, and blocking rules. Use when asked to set up Corgea MCP in Cursor or Claude Desktop, look up what vulnerabilities a scan found, check whether a dependency is vulnerable or reachable, export the dependency list as CSV, prioritise findings by severity, or check which blocking rules would fail a deployment.
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
supported. This is the thing most likely to stop you connecting: a client that
merely *opens* an SSE stream after connecting fails here, not only one
configured for SSE-only transport, and Cursor's built-in HTTP client is one of
those.

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
so the token can live in the environment rather than the file:

```json
{
  "mcpServers": {
    "corgea": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://www.corgea.app/mcp",
        "--transport",
        "http-only",
        "--header",
        "CORGEA-TOKEN:${env:CORGEA_TOKEN}"
      ]
    }
  }
}
```

The `mcp-remote` bridge is required here, not a convenience. Cursor's built-in
`"url"` form connects and then tries to open a GET SSE stream, which this
server refuses; the connection drops with
`Failed to open SSE stream: Not Acceptable` and no tools appear.

Cursor substitutes from its own process environment, and `export
CORGEA_TOKEN=...` in a terminal reaches only that shell and its children. A
Cursor started from the Dock, Start menu or a desktop entry never sees it, and
the header goes out empty — check this first when the answer is a `401`. Set it
where the desktop session will find it, then restart Cursor: `launchctl setenv
CORGEA_TOKEN <value>` on macOS, `setx CORGEA_TOKEN <value>` on Windows, or
`CORGEA_TOKEN=<value>` in `~/.config/environment.d/corgea.conf` on Linux.
Launching Cursor from a shell that already exports it works anywhere and
settles the question in one step.

Cursor spawns its own copy of the bridge; you never run `mcp-remote` yourself.

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

A client that posts JSON and does not insist on a standalone SSE stream can
skip the bridge:

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

Test it before trusting it. Several clients advertise streamable HTTP and still
open a GET SSE stream on connect, which fails here — Cursor is one, so do not
use this shape there. `Not Acceptable` or a 406 on connect is that.

The `${env:...}` shown is Cursor's spelling, kept for consistency with the rest
of this file. Claude Code uses `${VAR}`, other clients differ again, and a
client with no interpolation at all needs the variable set in the environment
it is launched from.

## Tools

`get_server_instructions` describes itself as *"Always call first"*, but as of
this writing it returns an empty string, so leading with it costs a round trip
and tells you nothing. Skip it. If it ever starts returning text, that text is
the server describing itself and it outranks this file.

Your client already holds the real tool list and the full argument schema for
each one, from `tools/list`. Work from those, not from a list written here — a
copy goes stale the first time a tool is added. What follows is a map of what
exists, not a signature reference:

| Area | Tools |
|---|---|
| Scans | `list_scans`, `get_scan_info` |
| SAST | `list_security_issues`, `get_issue_info` |
| SCA | `list_sca_security_issues`, `get_sca_issue_info`, `list_dependencies`, `export_dependencies_csv` |
| IaC | `list_iac_security_issues` |
| Code quality | `list_code_quality_issues` |
| Policy | `get_blocking_rules` |
| Meta | `get_server_instructions` |

Each tool's own description carries its filters, valid values and sort keys, in
more detail than is worth repeating. Read those. What they do not tell you:

- Every `list_*` filter except `scan_id`, `project`, `repo`, `page` and
  `page_size` goes inside a nested `filters` object. Passing them flat is the
  usual mistake.
- Prefer one `list_*` call to a loop of `get_*` per issue. Rate limits are 100
  requests a minute and 1000 an hour per token, returned as `429`.
- Empty results usually mean the filter missed, not that the account is clean.
  Drop `scan_id` or `project` and retry before reporting nothing found.
- `export_dependencies_csv` returns a download URL, not rows. It is for handing
  a file to the user; use `list_dependencies` when you need the data itself.

## Token handling

The token grants read access to every finding in the account. Keep it in an
environment variable or a secret manager, never in a committed config file, and
revoke it in the Corgea app if it leaks. This applies with most force to a
project-local `.cursor/mcp.json`, which is the copy that gets committed by
accident.

Keeping it out of the file does not keep it private on the machine. The client
expands `${env:...}` before spawning the bridge, so the token ends up in
`mcp-remote`'s command line and is readable by any local process through `ps`.
That is a reason to scope a token to one machine and rotate it, not a reason to
go back to writing it in the config.
