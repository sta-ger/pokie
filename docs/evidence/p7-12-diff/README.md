# P7-12 independent packaged-CLI rerun — 2026-08-26

Candidate: `cae85fbdf79fc78c2610d983364b68c0b1fcc01b`.

## Package and inputs

From this exact checkout, `npm pack --pack-destination <fresh-pack-dir>` completed its normal single `prepack`
build. The resulting `pokie-1.3.0.tgz` had SHA-256
`eddda92b168b30f48595d8335ea474b6d4ed179fa8cd3f58db58368db1041519`.
It was installed only once, in a new `mktemp -d` directory, with:

```text
npm install --ignore-scripts --no-audit --no-fund <candidate-tarball> --prefix <fresh-dir>
node <fresh-dir>/node_modules/pokie/dist/cli/pokie.js --version  # 1.3.0
```

Every public command below was run only as
`node <fresh-dir>/node_modules/pokie/dist/cli/pokie.js`; no checkout CLI or self-dependency binary was used.
Installed `--help` listed `diff` and `stakeengine`; `stakeengine diff --help` rendered its documented usage.

Inputs were created in that fresh directory through the installed CLI:

```text
create --random --seed 101 --out left.blueprint.json
create --random --seed 202 --out right.blueprint.json
```

Their SHA-256 values were respectively
`4b09855444457f6d69d57d5c91cbfcaf34dc55f0e7d8cda60c211ac18d536119` and
`f8f7608b0832f7edab7978c48b415e78f4262442eff8358a5e7f9de31abe12c5`.
`added.blueprint.json` was a declared JSON copy of the first input with a new manifest id and
`betModes: [{id:"base"},{id:"bonus",costMultiplier:2}]`; its SHA-256 was
`e162664ca393953387c44220896ad425cd41fb21511ac2fd30bd8332d097fad9`.
Installed `validate added.blueprint.json --format json` returned `valid: true`.

Each input was built through the installed CLI into the forms used below: `left-package`/`right-package`, native
Outcome Library directories (`left-native`, `right-native`, `added-native`), and Stake Engine directories
(`left-stake`, `right-stake`, `added-stake`).

## Public diff workflow results

All commands had the shown expected exit code. Every `--out` JSON file was immediately parsed by Node JSON
readback; retained hashes below identify the ephemeral artifacts without retaining them.

```text
sim left-package --rounds 200 --seed p7-12 --out sim-left.json              # 0
sim left-package --rounds 200 --seed p7-12 --out sim-identical.json         # 0
sim right-package --rounds 200 --seed p7-12 --out sim-right.json            # 0
diff sim-left.json sim-byte-identical.json                                  # 0; human: No changes detected.
diff sim-left.json sim-right.json --format json --out sim-changed-diff.json # 0; changed=true
diff sim-left.json sim-byte-identical.json --format json --out sim-identical-diff.json # 0; changed=false

diff left-native left-native                                                 # 0; human: No changes detected.
diff left-native right-native --format json --out native-changed-diff.json  # 0; native/native, changed=true
diff left-native added-native --format json --out native-added-diff.json    # 0; onlyInRight=["bonus"]
diff added-native left-native --format json --out native-removed-diff.json  # 0; onlyInLeft=["bonus"]

diff left-stake right-stake --format json --out root-stake-changed-diff.json # 0; stakeEngine/stakeEngine, changed=true
diff left-stake added-stake --format json --out root-stake-added-diff.json   # 0; onlyInRight=["bonus"]
diff added-stake left-stake --format json --out root-stake-removed-diff.json # 0; onlyInLeft=["bonus"]

stakeengine diff left-stake left-stake                                      # 0; human: No material differences detected.
stakeengine diff left-stake right-stake --format json --out stakeengine-changed-diff.json # 1; valid diff
stakeengine diff left-stake added-stake --format json --out stakeengine-added-diff.json   # 1; valid diff
stakeengine diff added-stake left-stake --format json --out stakeengine-removed-diff.json # 1; valid diff
diff sim-left.json left-native                                              # 1; actionable incompatible-kind diagnostic
```

`stakeengine diff` exit `1` is its documented material-difference result, not a write failure. Its JSON readback
contained `stakeDir`, clean left/right `issues`, and a `diff` object. Root Outcome Library and Stake Engine JSON
readbacks contained `changed`, `left`, `right`, `perMode`, `onlyInLeft`, and `onlyInRight`; the changed reports
were `true`, and the explicit identical simulation report was `false`.

```text
sim-changed-diff.json             26c3d8a55e5a8ca0020c600d9b2dacc3fd960ad292512f40d8edff0d3715020e
sim-identical-diff.json           22cb0b57edbecce34da7858e28708e10d809e72bdc00a9fdb9d198d6d6e58ce1
native-changed-diff.json          8740a2b6cd742a76e5e6de65f60affcf4bd2a58a871ac2bc2c1e5ab96196db25
native-added-diff.json            538c870cd71060cabea54a1ff09717a0e7559af75b60e98bcf371350c91ac71b
native-removed-diff.json          caf4a72480e8b3d79530b71e15df2dd4329e874e29de27b5455452119b559fa7
root-stake-changed-diff.json      f24f2b10e08fec8010a345844a9b4fbe203b26c2735369f5758afd948a4b2431
root-stake-added-diff.json        c74f13cafaf363c332c7a982369a39a1ef43ef12d551fe8daa372d99c30941db
root-stake-removed-diff.json      65dad7705a79cfa67cda25a9d11756bd96188f7251eb5d97fe8b5e90cbc8582a
stakeengine-changed-diff.json     b48912203ea9e0a1e26a40062239cb1d8a1a26801192155ed7a47d93262f0ec4
stakeengine-added-diff.json       628cdff50bf76f35e646281b99b4ce7ec68904ffd79b4fde6599beac874ef778
stakeengine-removed-diff.json     15c14e5337d3abb4a26c7c5b56e5ebf0c81140840cd9d185a02d3328565d1f2d
```

## Safe new-output checks

Each refusal exited `1` before writing. SHA-256 before/after comparisons passed for both existing sentinels,
the simulation input, the native `manifest.json`, and the two Stake `index.json` files. No nested target or its
parent was created.

```text
diff sim-left.json sim-right.json --out existing-root-diff.json       # existing destination rejected
diff sim-left.json sim-right.json --out ./sim-left.json               # input alias rejected
diff left-native right-native --out left-native/diffs/nested-diff.json # nested native input rejected
diff left-stake right-stake --out right-stake-alias/diffs/nested-diff.json # nested symlink alias rejected
stakeengine diff left-stake right-stake --out existing-stake-diff.json # existing destination rejected
stakeengine diff left-stake right-stake --out left-stake-alias/index.json # input-directory symlink alias rejected
stakeengine diff left-stake right-stake --out right-stake/diffs/nested-diff.json # nested Stake input rejected
```

All temporary package/install/project/output directories, sentinels, symlink aliases, and raw captures were
removed after readback. This directory retains only this bounded transcript.
