# Corgea Skills

Agent skills and Claude Code plugins for [Corgea](https://corgea.app) tools.

## Install

Install every skill with the [skills CLI](https://github.com/vercel-labs/skills).
It works with Claude Code, Cursor, Codex, OpenCode, and 70+ other agents:

```bash
npx skills add corgea/skills --skill '*'
```

Or install one skill:

Corgea Scan:

```bash
npx skills add corgea/skills --skill corgea-scan
```

Corgea MCP:

```bash
npx skills add corgea/skills --skill corgea-mcp
```

Sighthound:

```bash
npx skills add corgea/skills --skill sighthound
```

For Claude Code, add the marketplace:

```text
/plugin marketplace add corgea/skills
```

Then install one plugin:

Corgea Scan:

```text
/plugin install corgea@skills
```

Corgea MCP:

```text
/plugin install corgea-mcp@skills
```

Sighthound:

```text
/plugin install sighthound@skills
```

## Skills

| Skill | Description |
|---|---|
| [corgea-scan](plugins/corgea/skills/corgea-scan) | Drive the [Corgea CLI](https://github.com/Corgea/cli): scan with the AI-powered BLAST scanner, apply the AI-generated fixes, gate package installs, and inventory dependencies |
| [corgea-mcp](plugins/corgea-mcp/skills/corgea-mcp) | Query Corgea scans, findings, dependencies, and blocking rules over [MCP](https://docs.corgea.app/modelcontextprotocol) |
| [sighthound](plugins/sighthound/skills/sighthound) | Run [Sighthound](https://github.com/Corgea/Sighthound), a fast tree-sitter SAST scanner with pattern and taint-flow analysis |
| [sighthound-rules](plugins/sighthound/skills/sighthound-rules) | Write, test, and debug custom [Sighthound](https://github.com/Corgea/Sighthound) detection rules in RON format |

## License

[MIT](LICENSE)
