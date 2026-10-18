# Interactive playground

[Choose an example](gallery.md) or edit a Blueprint below. Execution needs only this locally served build; there is no CDN, account, Studio API or remote calculator.

POKIEPLAYGROUND

## Execution contract

Inspect and Validate check structural validity, supported composition and successful runtime initialization. Play executes one seeded entry. Simulate and Build report sample accepted mathematical steps; delivery frames do not add samples. Replay sample addresses the selected accepted step from the same seed, mode, denomination and funding. For exact entry equality use Replay displayed entry, which uses the actual initial runtime state and command. All-mode simulation produces independent results; choose one mode for Play or Replay.

Work is bounded to 64 KiB input, 8192 accepted simulation steps, 1024 replay steps, one Worker, 2 MB retained output, a 5 second silence timeout and a 20 second overall deadline. Optimization uses at most 16 candidates, four tunables and 8192 search and assessment samples. Continuing progress does not extend the deadline. Cancel, replacement, failure, page exit and success terminate owned Workers. Reload always resets jobs, output and candidate authority; drafts are not persisted.

## Reproduce downloads locally

After installing the checked POKIE package and a supported Node version, download model.blueprint.json, model.wasm, model.wasm.pokie-wasm.json and settings.json into a new directory. Sidecar placement is adjacent to the WASM bytes. run.json includes those same bytes and identities plus the actual output; it is a playground bundle, not a certification dossier or executable audit recording. report.json is a canonical SimulationReport or independent-mode SimulationReportSet, directly consumable by CLI report; reports.json is a convenience array of the same per-mode reports. replay.json contains actual restorable runtime state and commands; replay-observation.json is explicitly public observation only.

Download [reproduce.mjs](../examples/reproduce.mjs), place it alongside those files, then run:

```sh
node reproduce.mjs
pokie inspect model.wasm
pokie validate model.wasm
pokie run model.wasm --seed gallery-29
pokie sim model.wasm --rounds 256 --workers 1 --seed gallery-29 --format json --out cli-simulation.json
pokie report cli-simulation.json --format markdown --out cli-report.md
pokie report report.json --format html --out downloaded-report.html
pokie replay model.wasm --seed gallery-29 --round 128 --unit step --out cli-replay.json
```

The shared-library runner reads the exact seed, denomination, mode, accepted-step count, initial funding, artifact hash and runtime/schema versions from settings.json. These CLI examples demonstrate the default-bet command surface; the shared runner reproduces the exact displayed funding and selections. CLI sim has no selectable bet flag: they use the model default. Use the runner for a selected 7.5 or 1e-7 denomination, or any other non-default setting. The run/replay CLI help describes its supported state/audit inputs; do not pass a public observation as a checkpoint. The runner demonstrates the runtime-state replay API separately.

Convert source through `pokie build model.blueprint.json --target wasm --out fresh/model.wasm`; every artifact destination must be new or empty. Authored changes require explicit apply/save. The browser Apply action changes only the draft; subsequent downloads explicitly save the new revision.

## Optimization authority

The browser adapter tunes existing numeric paytable leaves in simple literal-reel base line models. It reuses the shared strict policy validator, seeded Cartesian ordering, lock/fixed/count/sum checks and held-out Hoeffding/Bonferroni assessment. Search and assessment have independent seed streams. Preview shows the request, constraints, budget, consumed work, population, target units, parameter diff and canonical math-definition diff. A confidence interval fully inside the tolerance with adequate event coverage is attained; partial domain coverage is exhausted, and uncertainty is inconclusive. Invalid and unsupported requests fail with their reason. Cancellation/deadline output is never a completed candidate. There is no browser filesystem publication or arbitrary package execution.

## Code-first example

[Download complete browser-safe extension source](../examples/extension.ts). It composes existing session/generator interfaces and executes actual math. Compile it with TypeScript in an installed package consumer and call extensionRound(seed, bet). It runs through the browser library API; custom executable collaborators cannot be compiled as a declarative WASM model. The gallery itself uses canonical Blueprint math rather than evaluating visitor-supplied JavaScript.


With TypeScript installed locally and a consumer `package.json` containing `"type": "module"`, compile and run the extension:

```sh
./node_modules/.bin/tsc extension.ts --module nodenext --target es2022 --outDir extension-build
node --input-type=module -e "import('./extension-build/extension.js').then(m => console.log(m.extensionRound('gallery-29')))"
```

To reproduce optimization, download optimization.json beside the original model and settings before applying, then run the same reproduce.mjs. It reruns candidate search and held-out assessment and checks candidate identity. The policy contains its independent search/assessment stream derivation. Candidate downloads remain Blueprint files; they do not grant Node filesystem publication authority.
