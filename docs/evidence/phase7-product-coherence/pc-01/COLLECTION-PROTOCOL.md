# Public-only collection protocol

Use this protocol from an empty working directory outside a POKIE checkout.
It intentionally does not say how to create, build, simulate, or otherwise
complete a game.  Help and the rendered application decide the next observable
surface.

## 1. Establish provenance

Record these fields in `PROVENANCE.md` before collecting evidence:

| Field | Required value |
| --- | --- |
| Run id | UTC timestamp and installed package version |
| Collector | person or automation identity |
| Host | OS, architecture, shell, and Node/npm versions |
| Package request | exact package specifier passed to npm |
| Working directory | absolute, newly created directory |
| Clean-room assertion | confirmation that no repository, source, tests, historical evidence, or success script was consulted |
| Started/ended | UTC timestamps |

Use a pinned public package version.  The following commands are the only
installation/bootstrap commands required by this protocol; copy their literal
stdout and stderr to files as well as recording their status.

```sh
mkdir -p runs/<run-id>/{cli/errors,studio/screenshots,artifacts}
cd runs/<run-id>
npm exec --yes --package=pokie@<version> -- pokie --version
npm exec --yes --package=pokie@<version> -- pokie --help
```

For every executed command append one TSV row to `commands.tsv` using exactly
these columns:

```
sequence	utc_started	command	cwd	stdin_provenance	stdout_file	stderr_file	exit_status	note
```

`stdin_provenance` is `none`, `terminal`, or the path and SHA-256 of an input
file.  Never omit a non-zero exit status; a visible failure is product evidence
and is not permission to retry it away.

## 2. Capture recursive installed-CLI help

The installed root help is the authority for the verb list.  Transcribe each
listed public verb into `cli/help-index.tsv`; do not infer verbs from a
repository, documentation site, or command names seen elsewhere.

```
verb	command	stdout_file	stderr_file	exit_status	captured_utc
```

For each row run, separately and without product arguments:

```sh
npm exec --yes --package=pokie@<version> -- pokie <verb> --help
```

Save stdout as `cli/<verb>-help.txt`, stderr as
`cli/<verb>-help.stderr.txt`, and record both paths and the exit status in the
index and `commands.tsv`.  If a help page lists a public subcommand, add it as
`<verb> <subcommand>` and repeat until no new help-listed public subcommands
remain.  Preserve aliases exactly as displayed, but link an alias to its
canonical command in the census rather than collecting duplicate output.

For each public option, capture its spelling, metavariable, default (when
displayed), and the command that displayed it.  Options are observations, not
instructions to invoke a workflow.

Collect one bounded error per parser family only when it requires no file
creation or server start:

```sh
npm exec --yes --package=pokie@<version> -- pokie __pc01_unknown_command__
```

Record the command, visible diagnostic, and exit status in
`cli/errors/unknown-command.*`.  Do not manufacture invalid project files or
repeat semantic errors merely to increase coverage.

## 3. Render Studio with a fresh browser profile

Use a fresh, uniquely named browser profile and a fresh Studio run directory.
Record the profile path and browser version in `studio/launch.txt`; the profile
contains no pre-existing cookies, local storage, history, or POKIE settings.
Launch Studio only through the installed CLI:

```sh
npm exec --yes --package=pokie@<version> -- pokie .
```

Capture the complete launch terminal output, the launch command's eventual
exit status, and the local URL it prints.  Navigate only through visible Studio
controls and record every landing page, available action, disabled action, and
visible success/error/empty/loading state encountered.  Do not use devtools,
network inspectors, page source, local APIs, direct routes, filesystem edits,
or a saved product workflow.

`studio/browser-transcript.md` uses one row per observed transition:

```
sequence | UTC | starting visible page/state | user-visible action | resulting visible page/state | visible text/error | screenshot id (or none)
```

The required bounded traversal is: initial rendered Studio page; every
top-level navigation item visible without creating data; and each immediately
visible action/state reachable without supplying domain data.  Stop at the
first form that requires a product choice, path, or generated input.  Record
that stopping point as `input required`, not as an untested failure.

## 4. Artifact ledger

After every command that writes or offers a download, list only files actually
observable in the run directory or explicitly downloaded by the browser.  Add
one row to `artifacts/ledger.tsv`:

```
sequence	producer_command_or_ui_action	absolute_path	sha256	byte_size	media_or_format	observed_purpose	exists_after_action
```

Never classify an advertised artifact as generated until a ledger row proves
it.  Never inspect file contents to reverse-engineer a product surface; file
name, extension, MIME type, size, hash, and command/UI provenance are enough
for this campaign step.

## 5. Screenshot convention

Screenshots are evidence only for a visual claim or a relationship that cannot
be established in terminal output or the transcript.  Name them
`NN-short-visible-claim.png`, where `NN` matches the transcript sequence.  A
screenshot must show the whole relevant browser chrome/content relationship at
the captured viewport and has a transcript row stating:

- viewport width x height and browser zoom;
- URL origin and visible route/title (never credentials or private paths);
- the exact visual claim it proves; and
- why text/transcript alone is insufficient.

Capture no screenshot for ordinary help output, duplicate page states, or
opaque implementation details.  Redact accidental personal paths/tokens
before retaining an image and note the redaction in the transcript.

## Completion boundary

A run is reproducible only when another collector can re-run every command in
`commands.tsv`, obtain the stated exit status, locate every saved stream, and
replay the browser transcript with a fresh profile.  It is bounded only when
all retained screenshots have a stated visual purpose and all artifacts have a
producer row.  Update the census from observations; do not declare product
success.

