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

Fields fall into two groups, and knowing which is which is most of debugging a
rule. If it fires in the wrong place or not at all, the cause is in the first
group; the second only labels what gets reported.

**What the rule matches**

| Field | Required | Notes |
|---|---|---|
| `mode` | no | `"search"` or `"taint"`; omitted means `"search"`. Every rule in the repo states it anyway — do the same |
| `pattern` / `patterns` | search mode | At least one |
| `sources` / `sinks` | taint mode | Both required in taint mode; a flow is reported when one reaches the other |
| `sanitizers` | no | Suppresses a flow whose expression contains one. The way to cut false positives in taint mode |
| `propagators` | no | Accepted by the schema and read by nothing — see the traps below. Propagation is built into the analysis, not configured per rule |
| `file_types` | no | `extensions`, `include_patterns`, `exclude_patterns`. Decides which files the rule is applied to at all |
| `conditions` | no | AST and context filters, search mode |

**What the finding says**

| Field | Required | Notes |
|---|---|---|
| `id`, `name`, `category`, `description` | no | Always set these; findings are unreadable without them |
| `severity` | no | `Critical`, `High`, `Medium`, `Low`. Omitted reports as `Medium` |
| `confidence` | no | `High`, `Medium`, `Low`. Omitted reports as `Medium` |
| `finding_type` | no | Free text, Title Case: `Command Injection`, `SQL Injection`, `Cross-Site Scripting` |
| `cwe_id` | no | Lowercase `cwe-<number>`, e.g. `cwe-78`. `CWE-78` appears only in comments |
| `tags`, `message` | no | |

## Search mode

Matches patterns directly. Fast, and the right default for dangerous calls and
insecure configuration. Patterns can be exact (`"eval("`), substring
(`"system"`), glob (`"*.innerHTML*=*"`), or regex (`"regex:os\\.system\\([^)]*\\)"`).

## Taint mode

Tracks untrusted data from `sources` to `sinks`, suppressing the finding when a
`sanitizer` intervenes. Use it when the danger depends on where the value came
from, not on the call itself.

One rule per sink class, so the CWE and the sanitizers fit what the rule
actually catches:

```ron
(
    rules: [
        (
            id: Some("php-sqli-001"),
            name: Some("Untrusted Input to SQL Query"),
            category: Some("injection"),
            mode: "taint",
            sources: Some(["$_GET", "$_POST", "$_REQUEST"]),
            sinks: Some(["query(", "mysqli_query(", "->prepare("]),
            sanitizers: Some(["intval", "filter_var", "mysqli_real_escape_string"]),
            finding_type: Some("SQL Injection"),
            severity: Some("Critical"),
            confidence: Some("Medium"),
            cwe_id: Some("cwe-89"),
            file_types: Some((
                extensions: Some([".php"])
            )),
        ),
        (
            id: Some("php-cmdi-001"),
            name: Some("Untrusted Input to Shell Command"),
            category: Some("command_execution"),
            mode: "taint",
            sources: Some(["$_GET", "$_POST", "$_REQUEST"]),
            sinks: Some(["exec(", "shell_exec(", "system(", "passthru("]),
            sanitizers: Some(["escapeshellarg", "escapeshellcmd"]),
            finding_type: Some("Command Injection"),
            severity: Some("Critical"),
            confidence: Some("Medium"),
            cwe_id: Some("cwe-78"),
            file_types: Some((
                extensions: Some([".php"])
            )),
        ),
    ]
)
```

Search mode on the same sink would flag every `query(` in the codebase. Taint
mode flags only those reachable from request input.

Resist folding sink classes together. A single rule spanning `query(` and
`shell_exec(` has to pick one `cwe_id` for both, and every finding it reports
then carries the wrong classification for half its matches — which is how
`rules/php/taint.ron` ends up filing command execution under `cwe-89`.

## Test the rule

This is the part to not skip. Write a fixture with a case that should fire and
a case that should not, then scan it directly:

Run the binary you just built, not whatever `sighthound` is on `PATH` — that
one is a different version and does not have your rules.

```bash
cargo build --release

# One rule file against a fixture directory
./target/release/sighthound /tmp/fixture python rules/python/command_injection.ron \
  --use-file-rules --output-format json

# A whole language directory
./target/release/sighthound /path/to/project python rules/python \
  --use-file-rules --output-format json

# Auto-detect languages, custom rules directory
./target/release/sighthound . --use-file-rules --rules-dir rules --output-format json
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

## Three traps

**A missing wrapper reads as an empty file.** Every loader deserializes into
`Rules`, whose `rules` list defaults to empty, so a file holding a bare rule
tuple parses without complaint and contributes nothing. A search rule written
that way exits 0 with `[]`, looking like a pattern that does not match; a taint
rule reports `No taint flow rules found`, which sends you to check `mode`
instead of the wrapper. `rules/RULE_WRITING_GUIDE.md` has a search-mode example
in this shape — follow the production `.ron` files instead, which all open with
`(rules: [`.

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

Being on the struct is not enough either. `propagators` deserializes fine and
is then read by nothing: `src/models.rs` declares it and no other file in
`src/` mentions it, which is why no rule under `rules/` sets one. Taint still
propagates through assignments and concatenation, but that is the analyser's
own behaviour and a rule cannot add to it. Compare `sanitizers`, which
`src/scanner/taint_utils.rs` reads on every candidate flow — if you want a rule
to change which flows are reported, that is the field that does it.

## Reducing false positives

In order of preference: narrow `file_types`, add `sanitizers` for taint rules,
then reach for `conditions`. Prefer several precise patterns over one broad
glob — `"*eval*(*)*"` will match far more than intended.
