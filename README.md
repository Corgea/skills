# Corgea Skills

Agent skills and Claude Code plugins for [Corgea](https://corgea.app) tools.

Install with the [skills CLI](https://github.com/vercel-labs/skills) — works
with Claude Code, Cursor, Codex, OpenCode, and 70+ other agents:

```bash
npx skills add corgea/skills --skill sighthound
```

Or as a Claude Code plugin:

```
/plugin marketplace add corgea/skills
```

## Skills

| Skill | Description |
|---|---|
| [corgea-scan](plugins/corgea/skills/corgea-scan) | Scan with the [Corgea CLI](https://github.com/Corgea/cli)'s AI-powered BLAST scanner, then review and apply the AI-generated fixes |
| [sighthound](plugins/sighthound/skills/sighthound) | Run [Sighthound](https://github.com/Corgea/Sighthound), a fast tree-sitter SAST scanner with pattern and taint-flow analysis |

## License

[MIT](LICENSE)
