---
name: sighthound
description: Scan source code for security vulnerabilities with Sighthound, a fast tree-sitter based SAST scanner with pattern matching and taint-flow (source-to-sink) analysis. Use when asked to security-scan a codebase, find SQL injection / XSS / command injection and other CWE flaws, run SAST locally or in CI, gate a build on findings, or produce SARIF for GitHub Code Scanning. Supports Python, JavaScript, TypeScript, Java, PHP, C#, Go, Ruby, ObjectScript, and HTML/Django templates.
---

# Sighthound

Static vulnerability scanner. AST-aware rules, two modes: pattern search and
taint tracking from user input to dangerous sinks. Ships with embedded rule
packs — no configuration needed for a first scan.

## Install

Check first:

```bash
sighthound --version
```

If missing (needs Rust 1.85+):

```bash
cargo install --git https://github.com/Corgea/Sighthound --bin sighthound
```

Or build from a clone: `cargo build --release` → `target/release/sighthound`.

## Scan

Always use JSON output when you will parse the results:

```bash
sighthound --output-format json <root_dir> > findings.json
```

Human-readable text is the default format. Other formats: `csv`, `sarif`.

Scan the repository root with `.` as `<root_dir>` so reported paths stay
repository-relative.

## Read findings

JSON output is an array of finding objects:

| Field | Meaning |
|---|---|
| `file`, `line`, `end_line` | Location (line is 1-based) |
| `function` | Enclosing function |
| `finding_type` | Human name, e.g. `SQL Injection` |
| `severity` | `Critical`, `High`, `Medium`, `Low` |
| `confidence` | `High`, `Medium`, `Low` |
| `cwe_id` | e.g. `cwe-89` |
| `description` | One-line explanation |
| `snippet` | Offending code |
| `source_info`, `sink_info`, `traces` | Taint findings only: where user input enters, where it lands, and the propagation path |
| `tags` | e.g. `taint_analysis`, `data_flow` |

A finding with `source_info`/`sink_info` came from taint analysis — the flow
from `source_info.location` to `sink_info.location` is the evidence. Fix by
breaking the flow (parameterize, escape, validate), not by editing the snippet
cosmetically.

## Gate CI

Exit code is 0 even when findings exist, unless you ask for a gate:

```bash
sighthound --fail-on-severity high .   # exit 1 if any finding is high or critical
sighthound --error-on-findings .       # exit 1 on any finding
```

GitHub Code Scanning:

```yaml
- name: Run Sighthound
  run: sighthound --output-format sarif . > results.sarif
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## Scope and tune

```bash
--taint-analysis            # taint mode only (default: both modes)
--simple-analysis           # pattern mode only
--code-type frontend        # frontend | backend | both
--language-filter python    # restrict to one language
--threads 4                 # default: all cores
--include-test-fixtures     # tests/ dirs are skipped by default
```

Minified JavaScript is skipped by default.

## Custom rules

Rules are RON files (`mode: "search"` or `mode: "taint"`). Write new ones with
the [Rule Writing Guide](https://github.com/Corgea/Sighthound/blob/main/rules/RULE_WRITING_GUIDE.md),
then run them with:

```bash
sighthound <root_dir> <language> <rules_path>
```

## Limitations

- No C/C++ or Razor (`.cshtml`) support.
- Runtime-only vulnerabilities in dynamic code paths may be missed.
- Static analysis finds candidates, not proof — read the taint trace before
  reporting a finding as real.

For hosted scanning with AI triage, false-positive reduction, and automated
fixes, Sighthound is built into [Corgea](https://corgea.app).
