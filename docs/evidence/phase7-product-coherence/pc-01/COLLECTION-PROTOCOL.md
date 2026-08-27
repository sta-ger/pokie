# Public-only collection protocol

Run this protocol in a newly created directory outside a POKIE checkout. It
does not say how to create, build, simulate, or otherwise complete a game.
Use the canonical layout in [README.md](README.md); every path below is
relative to `runs/<run-id>/` unless stated otherwise.

## 1. Provenance and capture convention

Before capture, create the listed layout and write `PROVENANCE.md` with the run
id, collector identity, OS/architecture/shell/Node/npm versions, exact package
specifier, absolute working directory, UTC start/end timestamps, and a
clean-room assertion that no source, tests, architectural documentation,
historical evidence, or success script was consulted.

For every terminal command, allocate a monotonic `command_id` such as `C001`;
create its designated stdout and stderr files first; then run the literal
command with direct redirection (`<literal command> > <stdout_file> 2>
<stderr_file>`). Do not use a pipeline, terminal scrollback, or a combined
stream as evidence. Record the literal command *without the redirections*,
the actual cwd, stdin provenance, UTC start and end timestamps, both stream
paths, and the actual exit status in `commands.tsv` after the process exits.

`commands.tsv` has this header and one append-only row per invocation:

```
command_id	utc_started	utc_ended	literal_command	cwd	stdin_provenance	stdout_file	stderr_file	exit_status	note
```

Use `none` for inherited closed/no input, `terminal` for interactive terminal
input, or `<absolute input path>;sha256=<digest>` for an input file. A command
with a non-zero status is evidence: preserve both streams and its row rather
than retrying it away. For a long-running Studio launch, reserve its `C...` id
while it runs, but append its sole complete command row only after the process
exits with its actual final status and end time.

All file paths stored in TSV/Markdown records are run-relative except the
actual command cwd, stdin file, browser-profile path, and artifact path, which
are absolute. Use UTC in RFC 3339 `YYYY-MM-DDTHH:MM:SSZ` form. Do not alter a
row or stream after it is recorded; append a new row and cross-reference it if
correction or recapture is required.

## 2. Bootstrap, version, and root help

Set `<version>` once to a pinned public package version. From the new run
directory, execute and capture these three commands in this order:

| Command id | Literal command | stdout | stderr |
| --- | --- | --- | --- |
| C001 | `npm install --no-save pokie@<version>` | `bootstrap.stdout.txt` | `bootstrap.stderr.txt` |
| C002 | `./node_modules/.bin/pokie --version` | `cli/version.stdout.txt` | `cli/version.stderr.txt` |
| C003 | `./node_modules/.bin/pokie --help` | `cli/root-help.stdout.txt` | `cli/root-help.stderr.txt` |

Record all three in `commands.tsv` using the capture convention, including the
installation status. The version stream is evidence of the installed binary;
the root-help stream is the only authority for the initial public verb list.
Do not inspect installed package source, even though the package manager has
placed it in the run directory.

## 3. Recursive installed-CLI help

Start `cli/help-index.tsv` with this exact header:

```
command_id	command_path	canonical_command_path	is_alias	literal_command	stdout_file	stderr_file	exit_status	captured_utc
```

Append one row for every help page reached from root or recursive installed
help. For a non-alias command, allocate a safe, unique `<command-id>` (for
example `C004-init`) and capture
`./node_modules/.bin/pokie <command path> --help` to
`cli/help/<command-id>.stdout.txt` and `cli/help/<command-id>.stderr.txt`.
Use the same terminal `command_id` in `commands.tsv` and `help-index.tsv`.
If displayed help lists a public subcommand, append it and recurse until no new
help-listed public subcommands remain. For every displayed alias, append an
alias row that cites the canonical command's stream rather than collect
duplicate output.

Append a separate CLI census record for each root flag, command, subcommand,
alias, and displayed option. Preserve an option's spelling, metavariable,
help text, and displayed default exactly as observed. An option is evidence of
public interface, not an instruction to invoke a product workflow.

Collect at most one parser-family error that does not create files or start a
server:

| Command id | Literal command | stdout | stderr |
| --- | --- | --- | --- |
| C... | `./node_modules/.bin/pokie __pc01_unknown_command__` | `cli/errors/unknown-command.stdout.txt` | `cli/errors/unknown-command.stderr.txt` |

Record that command in `commands.tsv` and create its individual census row.
Do not manufacture invalid project files or repeat semantic errors merely to
increase coverage.

## 4. Render Studio with a fresh browser profile

Use a fresh, uniquely named browser profile, record its absolute path and
browser version in `studio/launch-metadata.md`, and do not reuse cookies,
local storage, history, or POKIE settings. Launch Studio only through the
installed CLI:

```
./node_modules/.bin/pokie .
```

Capture the terminal's complete output in `studio/launch.stdout.txt` and
`studio/launch.stderr.txt`; its command row must include its launch time,
literal command, cwd, stdin provenance, paths, eventual exit status, and the
local URL printed (or `none`) in `note`. `launch-metadata.md` records the
matching command id, local URL, browser name/version, profile absolute path,
UTC browser start, viewport, and zoom.

Navigate only through visible Studio controls. Do not use devtools, network
inspectors, page source, local APIs, direct routes, filesystem edits, or a
saved product workflow. `studio/browser-transcript.md` begins with this header
and receives one append-only row per observed transition:

```
transition_sequence | utc | starting_visible_page_or_state | visible_action | resulting_visible_page_or_state | visible_text_or_error | screenshot_path_or_none | census_record_ids
```

The bounded traversal includes the initial rendered page, every top-level
navigation item visible without creating data, and every immediately visible
action/state reachable without supplying domain data. At the first control
requiring a product choice, path, or generated input, append a transcript row
and an individual Studio census record with status `input-required`; record
the visible boundary, no attempted input, evidence references, and
`phase7-studio-owner`. A page/action/state not reached must likewise receive a
`not-observed` census record owned by `phase7-studio-owner`; it is not covered.

## 5. Artifact ledger and screenshots

After each product command or browser action that writes a file or offers a
download, append one row per actually observable product file to
`artifacts/ledger.tsv`. Package-manager bootstrap files (`node_modules`, lock
files, and npm logs) are installation tooling, not product artifacts; preserve
their command and streams in `commands.tsv` but do not enumerate them in this
ledger:

```
ledger_id	utc_observed	producer_command_id_or_transition_sequence	absolute_path	sha256	byte_size	media_or_format	observed_purpose	exists_after_action
```

Do not classify an advertised type as generated until a ledger row proves it.
Do not inspect file contents to infer a product surface; filename, extension,
MIME type, size, hash, and producer provenance are sufficient here. Add a
separate artifact-census row for every advertised type, including a
`not-generated` row when the boundary prevented observation.

Screenshots are only for a visual claim or relationship that terminal output
and transcript text cannot prove. Name each one
`studio/screenshots/<transition-sequence>-<short-visible-claim>.png`; its
transcript row must cite that exact path and state viewport, zoom, URL origin
and visible route/title, the visual claim, and why text alone is insufficient.
Redact accidental personal paths or tokens before retaining an image and note
the redaction in that row. Do not capture ordinary help output, duplicate
states, or opaque implementation details.

## Completion boundary

A run is reproducible only if another collector can use `commands.tsv` to
re-run every completed command, locate each named stream, compare statuses,
and replay browser transitions from `browser-transcript.md` with a fresh
profile. It is bounded only if each screenshot has a visual purpose, every
artifact has a producer row, and every observed or blocked surface has an
individual census record. Update the census from observations; do not declare
product success.
