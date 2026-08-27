# PC-02 — frozen blind CLI discovery ledger

## Scope and freeze point

- Reviewed candidate: `936a7be4bfbab95ac5e7d6ee1abe5116c9c33448`
  (`[PC-02] harden imported bundle sidecars`). This is the exact candidate
  explored; it is not an inferred source revision or the later evidence-only
  commit that retains this ledger.
- Public entrypoint: `node ./dist/cli/pokie.js` (reported version `1.3.0`).
- Clean context: `/tmp/pc-02-blind-cli.0xPYOc`, created with `mktemp -d`.
- Explorer inputs: the executable's `--help` and command help, visible command
  output, and files the commands created. The recorded workflow did not use
  repository source, tests, prior evidence, or a prescribed product scenario.
  This ledger is frozen before any source-guided diagnosis.

The retained evidence is this command ledger and the checksums below; no
generated project, package, library, or command log was copied into the
repository. The temporary output path above is provenance, not a deliverable.
The help commands were run from the candidate checkout; every exploration
command below was run from that temporary directory. The command register is
the verbatim shell input from the frozen pass: every table row cites its
register ID, so abbreviations in the table do not replace an exact reproducer.

## Verbatim command register

`C00` was run in the candidate checkout. `C01` through `C15` were run in the
fresh directory named above. Each command has the listed exit status in the
ledger.

```sh
# C00 (exit 0)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js --help

# C01 (exit 0)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js import --help

# C02 (exit 0)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js build --help

# C03 (exit 0)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js sim --help

# C04 (exit 0)
mkdir -p 'paths with spaces' && node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js create 'Blind CLI' --random --seed 20260827 --out 'paths with spaces/blind game.blueprint.json'

# C05 (exit 0); C06 (exit 0)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js inspect 'paths with spaces/blind game.blueprint.json'
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js inspect '/tmp/pc-02-blind-cli.0xPYOc/paths with spaces/blind game.blueprint.json'

# C07 (exit 0)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js build 'paths with spaces/blind game.blueprint.json' --target tsPackage --out 'paths with spaces/package output' --dry-run && test ! -e 'paths with spaces/package output'

# C08 (exit 0); C09 (exit 1)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js build 'paths with spaces/blind game.blueprint.json' --target outcomeLibrary --out 'paths with spaces/library output' --sample 10 --seed 20260827
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js build 'paths with spaces/blind game.blueprint.json' --target outcomeLibrary --out 'paths with spaces/library output' --sample 10 --seed 20260827

# C10 (exit 1); C11 (exit 1); C12 (exit 1)
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js import
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js import missing-stake --out imported-relative
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js import '/tmp/pc-02-blind-cli.0xPYOc/missing-stake' --out '/tmp/pc-02-blind-cli.0xPYOc/imported-absolute'

# C13 (exit 130); C14 (exit 0); C15 (exit 0)
timeout --signal=INT --preserve-status 1 node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js sim 'paths with spaces/library output' --mode base --rounds 1000000000 --seed interrupt-output --out 'paths with spaces/interrupted.json'
test ! -e 'paths with spaces/interrupted.json'
node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js sim 'paths with spaces/library output' --mode base --rounds 5 --seed recovery-output --out 'paths with spaces/recovered.json'
```

## Public surface first encountered

| Exact command | Exit | Observation / natural next action |
| --- | ---: | --- |
| `node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js --help` | 0 | Listed `create`, `build`, `import`, `inspect`, `sim`, and `validate`; the build summary advertised `--dry-run`. |
| `node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js import --help` | 0 | Public import syntax requires `<source>` and offers `--out` and `--format`; it does not offer dry run or a cancellation flag. |
| `node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js build --help` | 0 | Confirmed the visible `--dry-run` contract: validate and preview without writing. |
| `node /home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-02-20260827154246/dist/cli/pokie.js sim --help` | 0 | Confirmed a normal simulation can write `--out`, giving a public interruption/recovery path to try. |

## Exploration ledger

| Variant | Exact reproducer | Exit | Relevant output / artifact provenance | Observation, intent, and actual outcome | Severity |
| --- | --- | ---: | --- | --- | --- |
| Spaced relative path | `C04` | 0 | Created `paths with spaces/blind game.blueprint.json`; SHA-256 `218077dc2c3d70982b51b3e0360c43f59c7c1cc2328d047bf9d890c69c75c08e`. | Natural intent: start with the help-suggested random game in an ordinary spaced directory. Actual: creation succeeded and printed a public build continuation. | none |
| Relative and absolute path forms | `C05`; `C06` | 0; 0 | Both identified the same Game Blueprint at the absolute resolved location and proposed quoted build commands. | Natural intent: follow the continuation using either shell-relative or copied absolute location. Actual: both forms were accepted. | none |
| Dry run | `C07` | 0 | Output: `Dry run — blueprint is valid, no files written.` The follow-up `test` confirmed the destination was absent. | Natural intent: preview the indicated package build safely. Actual: it named the files it would create without writing them. | none |
| Existing/stale output | `C08`; `C09` | 0; 1 | First run created `manifest.json` (`0d4d0b…a84c0`), `index_base.json` (`8c029c…ed04`), and `outcomes_base.jsonl` (`837c13…20ad4`). Repeat said destination already exists and is not empty, then directed the user to choose another `--out` or remove it. | Natural intent: repeat an export after seeing its result. Actual: existing output was preserved and the recovery action was explicit. | none |
| Missing positional input | `C10` | 1 | Output: `Usage: pokie import <source> [--out <path>] [--format json]`. | Natural intent: try the discovered import command before selecting a file. Actual: safe, concise usage error. | none |
| Invalid relative input | `C11` | 1 | Output included `stakeengine-import-index-missing: "missing-stake" has no index.json.` No output directory was created. | Natural intent: import a local directory that turns out not to be an export. Actual: rejection names the required public artifact. | none |
| Invalid absolute input | `C12` | 1 | Output included the same `stakeengine-import-index-missing` error with the absolute path. No output directory was created. | Natural intent: retry the visible error using a copied absolute path. Actual: equivalent safe rejection. | none |
| Interrupted/cancelled work | `C13`; `C14` | 130; 0 | The interrupted report file was absent. No command-level cancellation control appeared in `C03`; SIGINT was therefore the publicly reachable cancellation action exercised. | Natural intent: stop a long-running simulation and avoid trusting a partial report. Actual: SIGINT ended the command and no partial output was published. | none |
| Restart/recovery | `C15` | 0 | Printed five-round summary and wrote `recovered.json`, SHA-256 `fd201680ba06796b2b2ba9747e5110fe1f4806b755e540a6a0fc5f29fe89353a`. | Natural intent: restart after interruption with a bounded job. Actual: it completed normally and produced a fresh report. | none |

## Frozen findings forwarded to PC-05 (no remediation in PC-02)

These are discovery records, not implementation instructions. They remain open
for PC-05; this step neither diagnoses source causes nor changes product code,
tests, packaging, or public documentation.

| ID | Severity | Observation and exact reproducer | Natural intent | Actual outcome / PC-05 handoff |
| --- | --- | --- | --- | --- |
| PC-02-F01 | P1 | Published-install observation from the supplied frozen cumulative record. In a fresh directory, run `npm init --yes` (0), `npm install --ignore-scripts --no-audit --no-fund pokie@1.2.2` (0), `node -p "JSON.stringify(require('./node_modules/pokie/package.json').bin || null)"` (0, output `null`), `test ! -e node_modules/.bin` (0), and `npx --no-install pokie --help` (1, output `could not determine executable to run`). The installed package provenance was `pokie@1.2.2`; no local source artifact was substituted. | Install the public package, discover its executable, and ask for help before choosing a workflow. | Installation appears successful but provides no usable `pokie` executable. Preserve this as a published-artifact discovery for PC-05. |
| PC-02-F02 | P2 | Earlier bounded blind discovery, frozen at `e7d4be15cbf51383e6084bc874eeeb6436a31b74` before the reviewed candidate, is retained as a systemic handoff rather than relabelled as a current-candidate result. Its recorded public command chain was `node ./dist/cli/pokie.js import <POKIE-produced Stake export directory> --out imported-stake` (0), `node ./dist/cli/pokie.js inspect imported-stake` (1), then `node ./dist/cli/pokie.js validate imported-stake` (1). `import` reported writing `config.json`, `libraries/base.json`, and `source-provenance.json`; `inspect` rejected the directory and `validate` said `manifest.json` was missing. The temporary Stake export and raw log were intentionally discarded with that frozen run, so this row preserves the exact observed command shape, status, and output provenance without inventing a replacement fixture. | Import a POKIE-produced Stake export and immediately use the success-reported result through the next public `inspect` and `validate` actions. | Import reported success but produced an artifact rejected by both follow-ons. Preserve this recovery dead end as a PC-05 finding; it is not a PC-02 remediation instruction. |

The package-manager commands for PC-02-F01 were not rerun in this implementer
worktree: its command policy rejects `npm view`, installation, and `npx` with
exit `126`. The row therefore expressly preserves the prior frozen observed
result and its command/output provenance rather than substituting a synthetic
or source-derived result. PC-02 changes no product code, test, package
metadata, or public product documentation: the only retained artifact is this
discovery ledger.
