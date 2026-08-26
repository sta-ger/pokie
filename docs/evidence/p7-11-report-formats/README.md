# P7-11 independent public report-format rerun

Candidate: `54913835f1af1e620c9f6f858234d6a97380fb25` (`pokie` 1.3.0).

The public instructions read were the CLI overview in `README.md` and the
`init`, `sim`, and `report` sections of `docs/cli.md`.  In a newly-created
`/tmp/p7-11-report-formats.*` workspace, this exact candidate was packed once
with `npm pack`, then that tarball was installed into `runner/`.  Every journey
command below used only `runner/node_modules/.bin/pokie`; neither the source
checkout CLI nor `node_modules/.bin/pokie` was used.  `pokie init --no-prepare`
created the project, the same tarball was installed into it, and its public
`npm run build` produced the real game package.  `pokie validate` returned 0
and `valid yes` before simulation.

## Public journey

All commands below returned 0 unless marked otherwise.  `GAME` is the freshly
initialized package and `RUN` is a temporary output directory.

| Command | Readback |
| --- | --- |
| `pokie sim "$GAME" --rounds 2000 --seed p7-11-fixed-seed --format json --out "$RUN/sim-first.json"` | stdout parsed as JSON and was structurally identical to `sim-first.json`.  It reported 2,000/2,000 rounds, total bet 2,000, total win 399, RTP 0.19950000000000018, hit frequency 0.148, and max win 4. |
| Same `sim` command to `sim-second.json` | The deterministic fields matched the first report.  Only `durationMs` and `spinsPerSecond` varied, which are allowed timing-only fields. |
| `pokie report "$RUN/sim-first.json" --format json --out "$RUN/report.json"` | stdout parsed as JSON and exactly matched both JSON files semantically. |
| `pokie report "$RUN/sim-first.json" --format markdown --out "$RUN/report.md"` | stdout was nonempty; the file has `# Simulation Report: P7-11 Seeded Report Game` and Reproducibility, Warnings, and Recommendations sections. |
| `pokie report "$RUN/sim-first.json" --format html --out "$RUN/report.html"` | stdout was nonempty; the file has `<!DOCTYPE html>`, `<html>`, its simulation-report title, and Reproducibility, Warnings, and Recommendations content. |

The report's reproducibility block named seed `p7-11-fixed-seed` and a
re-run command.  Its rendered warning was `Requested rounds (2000) is low —
RTP/hit-frequency estimates may be noisy.`  The three rendered recommendations
included increasing rounds, using `pokie diff`, and saving JSON with `--out`.

Checksums identify the ephemeral generated artifacts without retaining them:

```
6e8142aa8a153451715f67a862bb409bfa6ce800d8989c6fdef5cf7fc9de5a82  sim-first.json
0b4ef8781d28473dd1851c83f5124dba87d3ebc7d1c7104491ce27833b949101  sim-second.json
6e8142aa8a153451715f67a862bb409bfa6ce800d8989c6fdef5cf7fc9de5a82  report.json
81367ca17d3155189b7f3c0156c0f1aab1f8c5dfb742b86a0b0d6e85b869d771  report.md
894789220365ea1bf003785d09e6dde7d8323c2ae9c7b031b7db4530ce2e68e8  report.html
```

## Recovery and focused candidate coverage

The following public CLI failures returned 1 and gave actionable recovery:

| Command | Observed diagnostic / safety check |
| --- | --- |
| `pokie report sim-first.json --format yaml` | Enumerates the accepted `markdown`, `html`, and `json` formats and usage. |
| `pokie report "$GAME" --format markdown` | Identifies the input as a POKIE game package, tells the user to run `pokie sim <packagePath> --out <file>`, then `pokie inspect <path>`. |
| `pokie report sim-first.json --format html --out "$RUN/missing-parent/report.html"` | Says the destination cannot be written and to choose an existing writable directory; neither the missing parent nor a partial report was created. |
| `pokie sim "$GAME" --rounds 0` | Says `--rounds must be a positive integer` and prints sim usage. |

One non-concurrent focused run also completed on the exact candidate:

```
npm run test:targeted -- tests/cli/commands/ReportCommand.test.ts tests/cli/commands/SimCommand.test.ts tests/cli/studio/StudioServer.test.ts
```

It passed 3/3 suites and 367/367 tests.  This covers the CLI/renderer command
contracts, seeded simulation report production, and Studio server report
downloads: its download route serves JSON, Markdown, and HTML for a completed
simulation, and checks invalid-format, absent-report, and rendering-failure
responses.  The command printed Jest's post-run open-handle advisory after the
passing assertions; the process subsequently exited without another test run.

The temporary workspace, packed tarball, generated game, reports, raw logs,
and npm installation trees were removed after these readbacks.  This evidence
directory intentionally retains this one transcript only.
