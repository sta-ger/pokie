# P7-12 independent public CLI rerun — 2026-08-26

Candidate: `4821eaf28bec5541edfd02ef9e4ddb4bbb2e5405`. The candidate was packed with `npm pack` (which ran its
normal `prepack` build), then installed with `npm install --ignore-scripts <candidate-tarball>` into a new
`mktemp -d` directory. Every workflow below used only the installed public CLI:

```text
node ./node_modules/pokie/dist/cli/pokie.js
```

The packed tarball SHA-256 was
`2dcdcfc614156f5d4c89b92d3ba725e687be31e139b01665c443d1d908751086`; `--version` printed `1.3.0`.

## Public inputs and successful root workflows

`create --random --seed 101 --out left.blueprint.json` and the equivalent seed-202 command supplied two
fresh, reproducible Blueprint inputs. Both were built through the installed CLI into packages, canonical Outcome
Library bundles, and Stake Engine exports. A public edit of the left Blueprint added the valid `base` and
`bonus` bet modes; `validate left.blueprint.json --format json` returned `valid: true`, and the CLI built the
corresponding two-mode native and Stake Engine artifacts.

```text
sim left-package --rounds 200 --seed p7-12 --out sim-left.json                 # 0
sim left-package --rounds 200 --seed p7-12 --out sim-identical.json            # 0
sim right-package --rounds 200 --seed p7-12 --out sim-right.json               # 0
diff sim-left.json sim-identical.json                                           # 0; “No changes detected.”
diff sim-left.json sim-right.json --format json --out sim-changed-diff.json    # 0; changed=true
diff left-native left-native                                                     # 0; native unchanged
diff left-native right-native                                                    # 0; native changed (RTP +14.89pp)
diff left-stake right-stake --format json --out root-stake-diff.json            # 0; both kinds=stakeEngine, changed=true
diff left-native added-native --format json --out native-added-mode-diff.json  # 0; onlyInRight=["bonus"]
diff left-stake added-stake --format json --out root-stake-added-mode-diff.json # 0; onlyInRight=["bonus"]
```

JSON parse/readback passed for all three simulation artifacts and all four written diff artifacts. The four
diff-artifact SHA-256 values were:

```text
sim-changed-diff.json              e908dac9dd0dcefed0f74e9f436f8f62989e19ebdc69631d3b3b1ee145fe2399
root-stake-diff.json               6eb12d1c7f61a78204ff06efc74dbb05ac48577bc8aa5fe33e9bc4550a595864
native-added-mode-diff.json        94d2195c8a5dd7ac08858d577e6216ada1bdbcb25d09d0a696dcbeb345902a3b
root-stake-added-mode-diff.json    2300aab1ab99b2218ef11703b89656b9a4708374d0ce73dcdae7106953b49f72
```

The compatibility diagnostic was also product-facing and actionable:

```text
diff sim-left.json left-native  # exit 1
Cannot compare a simulation report with an outcome source. Compare two simulation reports, or two Outcome Library bundles / Stake Engine exports.
```

Safe-write checks used an existing sentinel destination and an input-path alias. Both rejected the request with
exit `1`; before/after SHA-256 checks confirmed the sentinel and `sim-left.json` were unchanged.

```text
diff sim-left.json sim-right.json --out existing-diff.json  # destination already exists
diff sim-left.json sim-right.json --out ./sim-left.json      # destination is also an input
```

## Finding: advertised Stake Engine diff is not publicly dispatched

The required public command did not run:

```text
stakeengine diff left-stake right-stake --format json --out stakeengine-diff.json  # exit 1
Unknown command "stakeengine". Run `pokie --help` to list commands.
```

The installed CLI `--help` likewise omitted `stakeengine`. The source registration list contains `ExportCommand`
and `ImportCommand`, but no registered `StakeEngineCommand`; therefore the standalone command exists in source but
cannot be reached through this packed public CLI. No `stakeengine-diff.json` was created.

## Machine-owned contract rerun

```text
npm run test:targeted -- tests/cli/cliCommandInventory.contract.test.ts tests/cli/packageOnlyCommandInputs.contract.test.ts tests/cli/commands/StakeEngineCommand.diff.test.ts

PASS pokie tests/cli/cliCommandInventory.contract.test.ts
PASS pokie tests/cli/commands/StakeEngineCommand.diff.test.ts
PASS pokie tests/cli/packageOnlyCommandInputs.contract.test.ts
Test Suites: 3 passed, 3 total
Tests:       1073 passed, 1073 total
```

All temporary project trees, package install, generated artifacts, raw command captures, and sentinels were
removed after readback. This directory retains only this concise transcript.
