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

Sighthound:

```text
/plugin install sighthound@skills
```

## Skills

| Skill | Description |
|---|---|
| [corgea-scan](plugins/corgea/skills/corgea-scan) | Scan with the [Corgea CLI](https://github.com/Corgea/cli)'s AI-powered BLAST scanner, then review and apply the AI-generated fixes |
| [sighthound](plugins/sighthound/skills/sighthound) | Run [Sighthound](https://github.com/Corgea/Sighthound), a fast tree-sitter SAST scanner with pattern and taint-flow analysis |

## License

[MIT](LICENSE)
