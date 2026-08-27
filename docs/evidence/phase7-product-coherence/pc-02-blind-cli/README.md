# PC-02 — independent blind CLI exploration

## Binding and boundary

| Field | Recorded value |
| --- | --- |
| Candidate required and checked out | `b53a88916b990d2374984f3b7da4d03c8fedc61a` |
| CLI actually exercised | `node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js` |
| CLI version / executable SHA-256 | `1.3.0` / `ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83` |
| Work area | fresh `/tmp/pokie-blind-cli.i0ZEyl`; no project files retained in this repository |
| Explorer boundary | Before the exploration, the explorer did not inspect repository source, README/docs, prior evidence, prepared audit scripts, implementation reports, roadmap, or known findings. Commands and follow-ons were selected from public `pokie --help` / command help and their rendered output. |

The worktree was at the required commit and clean before the run. This record replaces the prior evidence file at this exact evidence root; it retains no generated artifact, full log, automation, browser profile, or source copy.

## Natural exploration transcript

The random source was created with `create lantern --random --seed 481516`; its rendered provenance says generator `1.1.0`, strategy `default-line-pay`, and supplies the reproduction command. `inspect` and `validate` passed. Source SHA-256: `3782c7491182a8e5085bdc823100b6c64a4d6c5723dd68e67e9fa53714bec450`.

| Public family and follow-on | Observed result / user impact |
| --- | --- |
| create; inspect/open | Random Blueprint created; `inspect` identified it and offered build targets. Missing-path `inspect` clearly rejected a non-project path. **Finding PC-05-CLI-01:** its “Before you continue” text says one must build before simulation, but the immediately following direct `sim <blueprint> --rounds 10 --seed explore-1` succeeded. This is misleading prerequisite language and adds an unnecessary detour. |
| validate; simulate | Blueprint and built-package validation passed. Direct Blueprint simulation and package simulation both passed; package run persisted JSON (`40` rounds, seed `explore-2`). |
| build; dry-run; stale output; recovery | `build --target tsPackage --dry-run` reported no writes, then a real package build succeeded. Repeating to the non-empty destination safely failed with the exact recovery: choose another `--out` or remove it; using `pkg-recovered` succeeded. Package `dist/index.js` SHA-256: `355001f10ab17cf71651ae52cbe14f3fa5f779739ddcd4257a70987d7f4cc655`. |
| report; replay | JSON simulation rendered to Markdown and replayed round `1` with seed `explore-2`; both output files were produced in the disposable work area. |
| build/export | Outcome-library dry run and build passed; `export --to outcomes` dry run and real export passed. The outcome-library report exposed mode `base`; its manifest SHA-256: `361359c620c5edb2b64ca8524deb27571787a1db2cd51f8837517932918f460a`. |
| simulate/report/replay reused outcome output | Native outcome report, `sim --mode base --rounds 20 --seed explore-3`, and exact replay round `20` all passed. The replay matched the simulation’s last outcome (`outcome-9e42380c0f867a96`, total win `0`). |
| export/import reuse and incompatible artifact | A built Stake adapter imported successfully and reported its deliberate lossy substitutions; Stake manifest SHA-256: `701af251b9d901ad8881dd82966fd3fe7923c23bf3e3c7e76be3116123a87241`, reconstructed manifest SHA-256: `098d9aaadd508a065203086698b592703998c0c2b05131971e61d9203bd1a618`. Trying to import the just-exported outcome artifact ended only with `stakeengine-import-index-missing: ... has no index.json`. **Finding PC-05-CLI-02:** this public incompatible-artifact dead end exposes an internal file prerequisite but does not identify the supplied artifact as an outcome library or say that only a Stake export/PAR workbook is importable, leaving no actionable recovery in the error itself. |
| serve; interruption | `serve <package> --port 0` reached the semantic ready state `POKIE dev server listening on http://127.0.0.1:41431`; it was deliberately interrupted with Ctrl-C after readiness. No product error was rendered. |

## Handoff classification

| PC-05 handoff | Classification | Observed impact | Severity |
| --- | --- | --- | --- |
| PC-05-CLI-01 | Misleading language / unnecessary internal prerequisite | `inspect` directs a user to build before simulation even though direct Blueprint simulation succeeds. | P2 |
| PC-05-CLI-02 | Incompatible artifact / recovery failure | An understandable export-to-import follow-on ends in an internal missing-index error, with neither artifact identification nor next step. | P2 |

No remediation was made. The other explored dead ends, duplicate-output handling, and recoveries were clear: missing paths were rejected as unsupported projects; dry runs wrote nothing; a duplicate build to a stale non-empty destination was protected and its recovery was stated; a fresh output path recovered successfully; the served process became ready before its intentional interruption.
