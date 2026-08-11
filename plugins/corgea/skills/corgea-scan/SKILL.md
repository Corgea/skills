---
name: corgea-scan
description: Scan a codebase for security vulnerabilities with Corgea's AI-powered BLAST scanner, then review and apply the AI-generated fixes. Use when asked to security-scan a project, scan a pull request diff or uncommitted changes before committing, list or inspect Corgea security or code-quality findings, view or apply a fix diff, upload a Semgrep/SARIF/Checkmarx/Coverity/Fortify report to Corgea, gate CI on severity or blocking rules, or produce SARIF or a CycloneDX SBOM.
---

# Corgea

Server-side AI scanner. `corgea scan` sends the code to Corgea, BLAST analyzes
it, and findings come back with AI-generated fix diffs you can apply. This
needs an account and a login — for a fully local scan with no account, use the
`sighthound` skill instead.

## Install

Check first:

```bash
corgea --version
```

```bash
npm install -g @corgea/cli
pip install corgea-cli
brew tap Corgea/cli && brew install corgea-cli
```

Or grab a binary from the [latest release](https://github.com/Corgea/cli/releases/latest)
(`corgea-<arch>-<platform>.zip`) and put it on `PATH`.

## Authenticate

```bash
corgea login                                              # browser OAuth
corgea login <TOKEN>                                      # non-interactive, for CI
corgea login --scope <company>                            # single-tenant OAuth
corgea login --url https://<instance>.corgea.app <TOKEN>  # single-tenant token
```

`CORGEA_TOKEN` and `CORGEA_URL` are both read from the environment, so a bare
`corgea login` works in CI when they are set.

## Scan

```bash
corgea scan                    # BLAST (AI), full project — the default
corgea scan semgrep            # run Semgrep locally, upload its results
corgea scan snyk               # run Snyk Code locally, upload its results
```

Use BLAST unless the user asks for something else. `semgrep` and `snyk` must
already be installed and on `PATH`; Corgea only orchestrates and uploads them.

Most flags are BLAST-only and exit 1 with `semgrep` or `snyk`: `--fail`,
`--fail-on`, `--block-on`, `--only-uncommitted`, `--out-format`, `--out-file`,
`--exclude`, `--metadata`, and `--sbom`. `--target`, `--scan-type`, and `--policy` are worse — those
scanners accept them and then silently ignore them, always scanning the whole
project. `--project-name` is the only flag that behaves the same everywhere.

### Choose what to scan

```bash
corgea scan --only-uncommitted                       # staged, modified, and untracked files
corgea scan --target src/,pyproject.toml             # paths, comma-separated
corgea scan --target "src/**/*.py"                   # glob
corgea scan --target git:diff=origin/main...HEAD     # a diff range
corgea scan --target git:staged,git:untracked        # git selectors
corgea scan --target -                               # newline-delimited file list on stdin
corgea scan --exclude 'tests/**,**/*.spec.js'        # drop matching files
```

`--only-uncommitted` and `--target` are mutually exclusive. `--exclude` needs
CLI 1.9.1 or newer.

### Narrow the scan type

```bash
corgea scan --scan-type secrets
corgea scan --scan-type blast,policy,secrets,pii
corgea scan --scan-type policy --policy 1
```

Types: `blast` (base AI), `policy` (PolicyIQ), `malicious`, `secrets`, `pii`.
A scan with no `--scan-type` runs all of them.

### Export

```bash
corgea scan --out-format sarif --out-file results.sarif   # json, html, sarif, markdown
corgea scan --sbom                                        # CycloneDX to bom.json
corgea scan --sbom sbom.cdx.json                          # custom SBOM path
corgea scan --project-name my-service                     # defaults to the git repo name
```

`--out-format` and `--out-file` must be passed together; either one alone is
an error.

## Wait

`corgea scan` already blocks until the scan completes, so results are ready
when it returns. `corgea wait` is for the cases where nothing is blocking: you
exited the scan early (it keeps running server-side), or you ran
`corgea upload`, which returns as soon as the report is accepted.

```bash
corgea wait             # latest in-progress scan
corgea wait SCAN_ID     # positional, not a --scan-id flag
corgea wait --repo org/repo
corgea wait SCAN_ID --project-id PROJECT_ID
```

Use `--repo` with an `org/repo` slug or remote URL, or `--project-name` to
query an exact Corgea project name. `--project-id` requires `SCAN_ID`.

## Read findings

```bash
corgea ls                                        # scans (alias: corgea list)
corgea ls --issues --scan-id SCAN_ID             # code/SAST issues in a scan
corgea ls --sca-issues                           # dependency issues
corgea ls --code-quality                        # code quality issues (alias: --quality)
corgea ls --repo https://github.com/org/repo    # resolve the project by repository
corgea ls --issues --scan-id SCAN_ID --json      # parse this, not the table
corgea ls --issues --page 2 --page-size 10
```

| Flag | Short | Meaning |
|---|---|---|
| `--issues` | `-i` | Code/SAST issues instead of scans |
| `--sca-issues` | `-c` | SCA (dependency) issues |
| `--code-quality` | `-q` | Code quality issues (alias `--quality`) |
| `--scan-id` | `-s` | Restrict to one scan |
| `--project-name` | | Query an exact Corgea project name |
| `--repo` | | Resolve from an `org/repo` slug or remote URL |
| `--page` | `-p` | Page number |
| `--page-size` | | Items per page |
| `--json` | | JSON output |

```bash
corgea inspect SCAN_ID                       # scan overview and issue counts
corgea inspect --issue ISSUE_ID              # full details plus the fix
corgea inspect --issue --summary ISSUE_ID
corgea inspect --issue --fix ISSUE_ID        # fix explanation only
corgea inspect --issue --diff ISSUE_ID       # diff only
corgea inspect --issue --json ISSUE_ID
```

`inspect` treats the ID as a scan unless you pass `--issue` / `-i`.

## Apply a fix

```bash
corgea ls --issues --scan-id SCAN_ID --json
corgea inspect --issue --fix ISSUE_ID        # why it is a vulnerability
corgea inspect --issue --diff ISSUE_ID       # the proposed change
```

`--diff` prints a patch, it does not write one. Read the fix explanation
before applying: the diff is a suggestion generated from the finding, and it
can conflict with local changes or miss a second call site with the same flaw.
Apply it by editing the files, then re-scan the touched paths with `--target`
to confirm the finding is gone.

## Gate CI

```bash
corgea scan --fail-on CR             # exit 1 at or above critical (CR, HI, ME, LO)
corgea scan --fail-on malicious      # exit 1 if any dependency is classified malicious
corgea scan --fail-on HI,malicious   # comma-separated, trips on either
corgea scan --block-on criticals     # exit 1 if a named CI blocking rule is violated
corgea scan --block-on criticals,malicious-deps
corgea scan --fail                   # deprecated: all active web-app blocking rules
```

`--block-on` accepts comma-separated rule slugs shown in the web app. Each rule
must exist, be active, and apply to CI; otherwise the command exits 1.
`--fail-on`, `--fail`, and `--block-on` are mutually exclusive.

GitHub Code Scanning:

```yaml
- name: Run Corgea
  run: corgea scan --out-format sarif --out-file results.sarif
  env:
    CORGEA_TOKEN: ${{ secrets.CORGEA_TOKEN }}
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## Upload an existing report

```bash
corgea upload report.json                       # Semgrep JSON, SARIF, Checkmarx, Coverity XML
corgea upload report.fpr                        # Fortify
corgea upload report.sarif --project-name svc
cat report.json | corgea upload                 # stdin
```

Uploads retry three times per file.

## Pre-commit hook

```bash
corgea setup-hooks                    # interactive
corgea setup-hooks --default-config   # secrets + PII, fail at LO and above
```

Installs a hook running `corgea scan blast --only-uncommitted`. Bypass a single
commit with `git commit --no-verify`.

## Severity codes

`CR` critical, `HI` high, `ME` medium, `LO` low. `--fail-on` trips at the given
level *and above*.

## Troubleshooting

- **Auth errors.** Run `corgea login`, or set `CORGEA_TOKEN`. Single-tenant
  instances also need `--url` or `CORGEA_URL`.
- **Third-party scanner not found.** `semgrep` / `snyk` must be on `PATH`.
- **Flag rejected as "only supported with blast scanner".** Drop the `semgrep`
  / `snyk` argument — see the BLAST-only list above.
- **`--exclude` unrecognized.** The installed CLI predates 1.9.1; upgrade.
- **No results yet.** Only possible after `corgea upload`, or if you exited a
  scan early — `corgea wait` first.
