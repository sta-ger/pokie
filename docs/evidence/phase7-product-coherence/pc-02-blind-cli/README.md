# PC-02 — independent blind CLI exploration

Run date: 2026-08-27. Candidate: `e9be42fab205685f9e812645980a07341e06b7b0`.
The worktree was clean before the run. Before recording these observations,
the explorer consulted no repository source, tests, documentation, prior
evidence, known findings, or implementation/fix summaries. Commands used the
candidate checkout's public CLI entrypoint: `node ./dist/cli/pokie.js`.

## Observed workflow

In a fresh temporary directory, `create blind-cli-game --random --seed
20260827` created a Blueprint. `inspect`, Blueprint `validate`, `build
--target tsPackage --dry-run`, real `build --target tsPackage`, package
`inspect`, and package `validate` all succeeded. A launched `serve` announced
`http://127.0.0.1:<ephemeral-port>`; a normal root request returned HTTP 404,
so it did not present a browser page. This was not treated as a defect: the
launch message calls it a local/dev reference server, and no UI was promised.

Package `sim --rounds 100 --seed cold-pass`, `report`, and `replay --round 1
--seed cold-pass` succeeded. `export --to outcomes` produced a valid Outcome
Library; its first `replay` visibly required `--mode`, and the single safe
retry with `--mode base` succeeded. `export --to adapter` also succeeded; its
own inspection clearly states that sampling, simulation, replay, and serving
require the compatible Outcome Library, so this incompatible-artifact boundary
was understandable rather than a finding. A same-destination export was
refused without overwriting anything and gave a concrete recovery action
(choose another output or remove the existing one).

## Finding: Stake import is a recovery dead end

`import <Stake export> --out imported-stake` reported success and wrote
`config.json`, `libraries/base.json`, and `source-provenance.json`. But its
immediate follow-ons fail: `inspect imported-stake` says it is not a supported
POKIE project, while `validate imported-stake` reports `valid no` because the
required outcome-library `manifest.json` is missing. The import notice instead
discusses an expected library-hash difference. Thus the success language is
misleading in user impact: the emitted directory cannot be opened or validated
as a POKIE artifact, and its supplied recovery direction asks the user to
repair a manifest that the import did not create.

## Impact ledger

| Surface | Observed classification and user impact |
| --- | --- |
| Create/open/build/validate | Working path: the generated Blueprint builds and validates as a runnable package. |
| Serve | Bounded dead end only for a root browser request (404); no false product finding because the CLI labels it a reference server. |
| Simulate/report/replay | Working path; native outcome replay exposes an explicit `--mode` prerequisite and succeeds after the one safe retry. |
| Export/duplicate output | Safe duplication guard: existing nonempty output is preserved with a direct recovery instruction. |
| Adapter compatibility | Explicit artifact boundary: the inspector directs users to the compatible Outcome Library for runtime actions. |
| Import/recovery | Product finding: success-reported Stake import emits an artifact that neither inspect nor validate can consume; validator requires an uncreated `manifest.json`. |

## Checksums of discarded temporary outputs

```text
5d733f577ff4c04e09d5d14885bf558cf7de49f3225ed85d6b30e85d7e312e28  blueprint JSON
9ec5f373dc4c6734095a1c783faf9a292f38f936ceb60faa5b7e127a7e75c4c4  package simulation JSON
28c3476611e4d45769f411e42625a90cd0268dbe409d7d2e35f3d6f99f44463e  package replay JSON
282730f2891d00dd625f6db745df2d3523b5293ea36155c9ce532fc20fec2747  outcome simulation JSON
d1fa6f8610b2468fa9825da511abb4f189913e5b9cc7ed719ada0a2c3bef55b4  imported config JSON
```

No generated project, output tree, raw log, profile, automation, or build
artifact is retained.
