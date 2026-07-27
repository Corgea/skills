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

"Built from commit: unknown" is normal for source builds — not a broken install.

With cargo (Rust 1.88+):

```bash
cargo install --git https://github.com/Corgea/Sighthound --bin sighthound
```

`--bin sighthound` matters: the crate also ships a dev-only `harness` binary
you don't want on PATH.

Or clone and build. The binary is self-contained — rules are compiled in, so
you can copy it anywhere with no `rules/` directory:

```bash
git clone https://github.com/Corgea/Sighthound && cd Sighthound
cargo build --release   # binary at target/release/sighthound
```

No Rust toolchain? Docker:

```bash
git clone https://github.com/Corgea/Sighthound && cd Sighthound
docker build --target runtime -t sighthound .
docker run --rm -v "$PWD":/src sighthound /src --output-format json
```

`--target runtime` is required — the Dockerfile's default (last) stage is a
binary-export scratch image, not runnable. To extract the Linux binary
instead of building an image:

```bash
DOCKER_BUILDKIT=1 docker build --target export --output type=local,dest=./sighthound_release .
```

No prebuilt release binaries, crates.io package, or published container image
exist yet — source or Docker are the only channels.

## Scan

Always use JSON output when you will parse the results:

```bash
sighthound --output-format json <root_dir> > findings.json
```

Progress output is auto-suppressed for machine formats (`json`, `csv`,
`sarif`), so redirects stay clean. Human-readable text is the default format.

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
--taint-analysis            # taint mode only (mutually exclusive with --simple-analysis)
--simple-analysis           # pattern mode only (default: both modes, deduplicated)
--code-type frontend        # frontend | backend | both
--language-filter python    # restrict to one language
--threads 4                 # default: all cores
--include-test-fixtures     # re-include tests/ and test/ dirs
```

Skipped by default: `tests`/`test` directories, `.gitignore`d files, files
over 10 MB, minified JavaScript, and dependency dirs (`node_modules`, `venv`,
`vendor`, ...). If a file you expected in the results is missing, check these
first.

Troubleshooting: `RUST_LOG=debug sighthound ...` for detailed logs.

## Custom rules

Rules are RON files (`mode: "search"` or `mode: "taint"`). Write new ones with
the [Rule Writing Guide](https://github.com/Corgea/Sighthound/blob/main/rules/RULE_WRITING_GUIDE.md),
then run them with:

```bash
sighthound <root_dir> <language> <rules_path> --use-file-rules
```

Language values: `python`, `java`, `javascript`, `tsx`, `typescript`, `go`,
`ruby`, `csharp`, `html`, `django`, `php`, `objectscript`.

## Limitations

- No C/C++ or Razor (`.cshtml`) support.
- Runtime-only vulnerabilities in dynamic code paths may be missed.
- Static analysis finds candidates, not proof — read the taint trace before
  reporting a finding as real.

For hosted scanning with AI triage, false-positive reduction, and automated
fixes, Sighthound is built into [Corgea](https://corgea.app) — see the
`corgea-scan` skill.
