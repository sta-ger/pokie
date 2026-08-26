# P7-18 independent public CLI rerun transcript

## Provenance and package readback

Candidate checkout: `b34a4968fa4c52b1632903f883f6408e330aa66a`
Fresh directory: `/tmp/p7-18-public-cli-mikgYw` (created with `mktemp -d`)
Packed with: `npm pack --pack-destination /tmp`
Tarball: `/tmp/pokie-1.3.0.tgz`
Tarball SHA-256: `82462d1cde78c375bb5e38d015c00e0e02b04d25d897f786358ef43d1dfea498`

```text
$ npm install --ignore-scripts --prefix <fresh-dir> /tmp/pokie-1.3.0.tgz
[exit 0; added 99 packages]
$ node -p "require('<fresh-dir>/node_modules/pokie/package.json').version"
1.3.0
[exit 0]
```

All CLI commands below use only:

```text
node <fresh-dir>/node_modules/pokie/dist/cli/pokie.js
```

## Public help and documentation inventory

`pokie --help` exited `0`. Its complete registered public inventory was:

```text
build, certification, client, create, dev, diff, edit, export, fairness,
generate, init, import, inspect, par, reel, replay, report, serve, sample,
sim, validate
```

Each inventory command was independently invoked as `pokie <command> --help`; every invocation exited `0` and rendered a command-local `Usage:` line. The root help contains no `outcomelibrary`, `outcomesource`, or `stakeengine` command.

```text
build          Usage: build [options] <project> [excess...]
certification  Usage: certification [options] [command]
client         Usage: client [options] <packageRoot> [excess...]
create         Usage: create [options] [name] [excess...]
dev            Usage: dev [options] <packageRoot> [excess...]
diff           Usage: diff [options] <leftProjectOrReportJson> <rightProjectOrReportJson> [excess...]
edit           Usage: edit [options] <blueprint> [excess...]
export         Usage: export [options] <source> [excess...]
fairness       Usage: fairness [options] [command]
generate       Usage: generate [options] <packageRoot> [excess...]
init           Usage: init [options] [directory] [excess...]
import         Usage: import [options] <source> [excess...]
inspect        Usage: inspect [options] <packageRoot> [excess...]
par            Usage: par [options] [command]
reel           Usage: reel [options] [command]
replay         Usage: replay [options] <packageRoot> [excess...]
report         Usage: report [options] <projectOrSimulationReportJson> [excess...]
serve          Usage: serve [options] <packageRoot> [excess...]
sample         Usage: sample [options] <path> [excess...]
sim            Usage: sim [options] <packageRoot> [excess...]
validate       Usage: validate [options] <project> [excess...]
```

Current public documentation checked: `docs/cli.md` SHA-256 `a7fbd3e71939d644ce14e0df2e907484cebc958531605a0824baded08625cb5a`. Every listed public command is referenced there. A literal search for `pokie outcomelibrary`, `pokie outcomesource`, and `pokie stakeengine` across `docs/cli.md`, `docs/outcome-library-bundle.md`, and `docs/weighted-outcome-library.md` had zero matches.

## Removed private namespaces

```text
$ pokie outcomelibrary
Unknown command "outcomelibrary". Run `pokie --help` to list commands.
[exit 1]
$ pokie outcomesource
Unknown command "outcomesource". Run `pokie --help` to list commands.
[exit 1]
$ pokie stakeengine
Unknown command "stakeengine". Run `pokie --help` to list commands.
[exit 1]
```

## Residual diagnostics

```text
$ pokie unknown-residual-command
Unknown command "unknown-residual-command". Run `pokie --help` to list commands.
[exit 1]

$ pokie generate
Usage: pokie generate <packageRoot> [--mode <betModeId>] [--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] [--exact | --sample <n> --seed <string>] [--estimate | --dry-run] [--out <file>] [--resume <file>] [--progress] [--format json]
<packageRoot> is a package built by "pokie build" (or any package loadPokieGame() can require) whose game opts into exact enumeration via PokieGame.createExactEnumerationSession -- see docs/weighted-outcome-library.md#generation.
[exit 1]

$ pokie build not-a-project --target not-a-target
Unknown --target "not-a-target". --target must be one of: tsPackage, outcomeLibrary, stakeAdapter, parWorkbook.
[exit 1]

$ pokie report missing-report.json --format xml
--format must be "markdown", "html", or "json". Usage: pokie report <projectOrSimulationReportJson> [--format markdown|html|json] [--out <file>]
[exit 1]

$ pokie sample missing-outcome-source --mode base
"missing-outcome-source" does not resolve to a recognized POKIE project.
[exit 1]

$ pokie build missing-project --target tsPackage
"missing-project" was not recognized as a POKIE project.
<project> is a path pokie resolves to a blueprint/tsPackage/outcomeLibrary/stakeAdapter/wasm/parWorkbook project (see docs/cli.md#pokie-build-project).
[exit 1]
```

The displayed natural failure output contains no raw stack frame, `Error:`, `ENOENT`, source filename, class name, or private command namespace.

## Created-artifact check

```text
$ pokie create verification-proof --blank --out <fresh-dir>/verification-proof.json
created <fresh-dir>/verification-proof.json
[exit 0]
$ SHA-256 <fresh-dir>/verification-proof.json
c75e180a40a841b1e3d334a52488f733279fe6419a5738f210b9b2e811f45fea
$ JSON readback
valid-json; keys=manifest,paytable,reels,rows,symbols
```

The generated artifact and fresh installation were not retained.
