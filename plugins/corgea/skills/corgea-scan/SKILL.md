---
name: corgea-scan
description: Drive the Corgea CLI to scan code for security vulnerabilities with the AI-powered BLAST scanner and apply the AI-generated fixes, gate pip and npm installs against vulnerable or malicious packages, inventory dependencies and produce SBOMs, and look up advisories. Use when asked to security-scan a project, scan a pull request diff or uncommitted changes before committing, install a pip/npm package safely, list or inspect Corgea findings, view or apply a fix diff, upload a Semgrep/SARIF/Checkmarx/Coverity/Fortify report, gate CI on severity, or produce SARIF for GitHub Code Scanning.
---

# Corgea CLI

Server-side AI scanner. `corgea scan` sends the code to Corgea, BLAST analyzes
it, and findings come back with AI-generated fix diffs you can apply. This
needs an account and a login — for a fully local scan with no account, use the
`sighthound` skill instead. To query existing findings without running
anything, use the `corgea-mcp` skill.

## Check the installed CLI first

This file describes the CLI in general. The binary on this machine describes
itself, and it is the one that has to run the command:

```bash
corgea --version
corgea --help
corgea <command> --help
```

**Where `--help` and this file disagree, `--help` is right.** Confirm any
command or flag you have not seen in `--help` before running it, rather than
guessing from here.

If something documented here is missing, the installed CLI is older than this
file. Tell the user, with the upgrade for how they installed it — do not
upgrade unprompted, since CI runners and self-hosted installs are often pinned
deliberately. A missing flag is the visible case; a changed default or output
shape will not error, so treat a surprising result on an older CLI as a
version difference before treating it as a bug.

The full reference — flag matrix, scan types, export formats, report uploads,
CI gating, the install gate, SBOMs and advisory lookups — is in the
[CLI docs](https://docs.corgea.app/install_cli).

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

## Core commands

```bash
corgea scan                                          # BLAST (AI), full project — the default
corgea scan --only-uncommitted                       # staged, modified, and untracked files
corgea scan --target src/,pyproject.toml             # paths, globs, or git: selectors
corgea scan --fail-on CR                             # exit 1 at or above critical (CR, HI, ME, LO)
```

`corgea scan` blocks until the scan completes. `corgea wait [SCAN_ID]` is only
for when nothing is blocking — you exited a scan early, or ran `corgea upload`.

```bash
corgea ls                                        # scans (alias: corgea list)
corgea ls --issues --scan-id SCAN_ID --json      # parse this, not the table
corgea ls --sca-issues                           # dependency issues
```

```bash
corgea inspect SCAN_ID                       # scan overview and issue counts
corgea inspect --issue ISSUE_ID              # full details plus the fix
corgea inspect --issue --diff ISSUE_ID       # the proposed change
```

`inspect` treats the ID as a scan unless you pass `--issue` / `-i`.

## Applying a fix

`--diff` prints a patch, it does not write one. Read the fix explanation
(`corgea inspect --issue --fix ISSUE_ID`) before applying: the diff is a
suggestion generated from the finding, and it can conflict with local changes
or miss a second call site with the same flaw. Apply it by editing the files,
then re-scan the touched paths with `--target` to confirm the finding is gone.

## Severity codes

`CR` critical, `HI` high, `ME` medium, `LO` low. `--fail-on` trips at the given
level *and above*.
