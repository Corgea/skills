---
name: sighthound-rules
description: Write, test, and debug custom Sighthound security rules in RON format. Use when asked to add a detection rule to Sighthound, write a pattern or taint-flow rule, catch a vulnerability class Sighthound currently misses, reduce false positives on an existing rule, port a Semgrep or CodeQL rule to Sighthound, or debug a rule that does not fire.
---

# Writing Sighthound rules

Rules live in the [Sighthound](https://github.com/Corgea/Sighthound) repo under
`rules/<language>/`. Work from a clone of that repo; a rule cannot be tested
without the scanner.

To run scans rather than author rules, use the `sighthound` skill instead.

## Before writing anything

Read `rules/RULE_WRITING_GUIDE.md` in the repo. It is the authoritative
reference and covers condition types and pattern syntax in more detail than
this skill does. Then read a neighbouring rule file for the language you are
targeting, and match its conventions.

## Format

Rules are **RON** (Rusty Object Notation), not YAML or JSON. Only files ending
`.ron` are loaded; anything else is ignored silently.

Three things trip up anyone arriving from Semgrep or YAML rules:

- A file is a `(rules: [...])` wrapper holding **many** rules, not one rule per
  file.
- Optional fields take explicit `Some(...)` / `None`. Bare values do not parse.
- Strings use double quotes, and entries are comma-separated.

```ron
(
    rules: [
        (
            id: Some("python-cmd-injection-001"),
            name: Some("OS Command Execution"),
            category: Some("command_execution"),
            mode: "search",
            patterns: Some([
                "os.system",
                "os.popen",
            ]),
            finding_type: Some("Command Injection"),
            severity: Some("High"),
            confidence: Some("Medium"),
            cwe_id: Some("cwe-78"),
            description: Some("OS command execution sink - verify the command is not built from untrusted input"),
            file_types: Some((
                extensions: Some([".py"])
            )),
            tags: Some(["command", "injection", "os"]),
        ),
    ]
)
```

### Fields

Only `mode` plus its matching payload is load-bearing. Everything else is
metadata that shapes the finding.

| Field | Required | Notes |
|---|---|---|
| `mode` | yes | `"search"` or `"taint"`. Defaults to `"search"` if omitted |
| `pattern` / `patterns` | search mode | At least one |
| `sources` / `sinks` | taint mode | `sanitizers` and `propagators` optional |
| `id`, `name`, `category`, `description` | no | Always set these; findings are unreadable without them |
| `severity`, `confidence`, `finding_type`, `cwe_id` | no | `Critical`, `High`, `Medium`, `Low` |
| `file_types` | no | `extensions`, `include_patterns`, `exclude_patterns` |
| `conditions` | no | AST and context filters, search mode |
| `tags`, `message` | no | |

## Search mode

Matches patterns directly. Fast, and the right default for dangerous calls and
insecure configuration. Patterns can be exact (`"eval("`), substring
(`"system"`), glob (`"*.innerHTML*=*"`), or regex (`"regex:os\\.system\\([^)]*\\)"`).

## Taint mode

Tracks untrusted data from `sources` to `sinks`, suppressing the finding when a
`sanitizer` intervenes. Use it when the danger depends on where the value came
from, not on the call itself.

```ron
(
    id: Some("php-taint-001"),
    name: Some("Untrusted Input to Dangerous Sink"),
    category: Some("injection"),
    mode: "taint",
    sources: Some(["$_GET", "$_POST", "$_REQUEST"]),
    sinks: Some(["query(", "exec(", "shell_exec("]),
    sanitizers: Some(["intval", "escapeshellarg", "filter_var"]),
    finding_type: Some("Tainted Data Flow"),
    severity: Some("High"),
    confidence: Some("Medium"),
    cwe_id: Some("cwe-89"),
    file_types: Some((
        extensions: Some([".php"])
    )),
)
```

Search mode on the same sink would flag every `query(` in the codebase. Taint
mode flags only those reachable from request input.

## Test the rule

This is the part to not skip. Write a fixture with a case that should fire and
a case that should not, then scan it directly:

```bash
cargo build --release

# One rule file against a fixture directory
sighthound /tmp/fixture python rules/python/command_injection.ron \
  --use-file-rules --output-format json

# A whole language directory
sighthound /path/to/project python rules/python \
  --use-file-rules --output-format json

# Auto-detect languages, custom rules directory
sighthound . --use-file-rules --rules-dir rules --output-format json
```

`--use-file-rules` is mandatory when iterating. Without it the scanner uses the
rules compiled into the binary and your edits do nothing.

Narrow the analysis while iterating with `--simple-analysis` (search only) or
`--taint-analysis` (taint only); the default runs both. Add
`--include-test-fixtures` when your fixture lives somewhere the scanner would
normally skip, such as `tests/`.

Existing fixtures worth copying from:

- `tests/test_files/python/fixtures/search_mode_patterns.py`
- `tests/test_files/python/fixtures/taint_mode_patterns.py`
- `tests/test_files/accuracy_tests/` — true and false positive corpora

Then run the suites before opening a PR:

```bash
cargo test --test unit_tests        # parses and well-formedness
cargo test --test strictness_tests  # taint accuracy contracts
make ci                             # the exact gate CI runs
```

## Conventions

- Rule IDs follow `{language}-{category}-{number}`, e.g. `python-cmd-injection-001`.
- Group rules by theme in one file: `command_injection.ron`, `sql_injection.ron`.
- New `.ron` files in an existing language directory are picked up with no code
  change; rules are compiled in via `include_dir!`.
- TypeScript and TSX resolve to `rules/javascript/`. Django and HTML templates
  resolve to `rules/html/`.
- `exclusion_patterns.ron` is a different structure and is skipped when rules
  are merged. Do not add detection rules to it.

## Two traps

**A malformed rule looks like a scanner bug.** There is no rule linter and no
schema. A RON syntax error or a misspelled field surfaces as a load failure or,
worse, as a rule that simply never matches. If a new rule produces nothing,
confirm the file parses before assuming the pattern is wrong:

```bash
cargo test --test unit_tests
```

**Unknown fields are ignored silently.** Deserialization does not reject fields
it does not recognise, so a typo costs no error and has no effect. Real example:
`unless:` appears in `rules/javascript/frontend_security.ron`, but no such field
exists on the rule struct and nothing in the scanner reads it. Those exclusions
are inert. Check a field against the guide before relying on it.

## Reducing false positives

In order of preference: narrow `file_types`, add `sanitizers` for taint rules,
then reach for `conditions`. Prefer several precise patterns over one broad
glob — `"*eval*(*)*"` will match far more than intended.
