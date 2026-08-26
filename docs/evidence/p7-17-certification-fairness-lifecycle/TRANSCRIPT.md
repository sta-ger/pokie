# Bounded transcript

Candidate checkout: `c02a7aa636bbae6b9e89f7d8883391bfa83aa061`.

## Clean packed installation

```text
npm pack --pack-destination <fresh>/pack                         exit 0
tarball: pokie-1.3.0.tgz
tarball SHA-256: 0b76f6355397db2e67817fd5ff9a55ccc3c6b7569be3fc613f4c0b33f3b2c3f9
npm install --ignore-scripts --no-audit --no-fund --prefix <fresh>/install <tarball>
                                                                  exit 0
node <fresh>/install/node_modules/pokie/dist/cli/pokie.js --version
                                                                  exit 0  (1.3.0)
```

Every `<cli>` below is exactly that installed entrypoint, never the source
checkout's stale self-dependency. Its public `--help` listed both
`outcomelibrary` and `outcomesource`, alongside `certification` and `fairness`.

## Public lifecycle

The only authored initial inputs were the command-produced random Blueprint,
the documented bundle/certification config descriptors, and `server-seed.txt`.
No generated artifact was edited. Paths are abbreviated as `<work>`.

| Step | Installed public command | Exit | Concise readback |
| --- | --- | ---: | --- |
| Blueprint | `<cli> create p7-17-lifecycle-slot --random --seed 17017 --out <work>/game.blueprint.json` | 0 | Created `P7 17 Lifecycle Slot`, id `p7-17-lifecycle-slot`. |
| TypeScript package | `<cli> build <work>/game.blueprint.json --target tsPackage --out <work>/game-package` | 0 | `name=p7-17-lifecycle-slot`, `version=0.1.0`, `main=./dist/index.js`. |
| Generated library | `<cli> outcomelibrary generate <work>/game-package --sample 12 --seed library-sampling-seed --out <work>/sampled-library.json --format json` | 0 | `libraryId=p7-17-lifecycle-slot`; 12 outcomes; total weight 12. |
| Repeat generation | Same command, output `<work>/sampled-library-repeat.json` | 0 | Exact same SHA-256 as first library (below). |
| Native bundle | `<cli> outcomelibrary build <work>/bundle-config.json --out <work>/bundle` | 0 | Emitted `index_base.json`, `outcomes_base.jsonl`, `manifest.json`; manifest `generatedBy=pokie outcomelibrary build`. |
| Deep validation | `<cli> outcomelibrary validate <work>/bundle --deep` | 0 | Valid outcome-library bundle. |
| Source inspection | `<cli> outcomesource inspect <work>/bundle` | 0 | Native canonical source, streaming; exact base-mode RTP 100.00%, hit frequency 41.67%. |
| Seeded source sample | `<cli> outcomesource sample <work>/bundle --mode base --seed downstream-sample-seed` | 0 | Repeated once with same outcome id and identical artifact. |
| Certification build | `<cli> certification build <work>/bundle <work>/certification-config.json --out <work>/certification` | 0 | Emitted `samples_base.jsonl`, `manifest.json`. |
| Certification verify | `<cli> certification verify <work>/certification --source <work>/bundle` | 0 | Verified successfully. |
| Repeat certification | Same build, output `<work>/certification-repeat` | 0 | Same evidence content hash and samples bytes (below). |
| Seed commitment | `<cli> fairness seed-commit <work>/server-seed.txt --out <work>/server-seed-commitment.json` | 0 | Emitted server-seed commitment. |
| Round commitment | `<cli> fairness commit <work>/server-seed-commitment.json --client-seed player-lifecycle-seed --nonce 7 --source <work>/bundle --mode base --out <work>/round-commitment.json` | 0 | Consumed emitted seed commitment and bundle. |
| Reveal proof | `<cli> fairness reveal <work>/round-commitment.json --server-seed <work>/server-seed.txt --source <work>/bundle --out <work>/round-proof.json` | 0 | Emitted proof for `outcome-e3c45e1282ad47ad`. |
| Fairness verify | `<cli> fairness verify <work>/round-proof.json --commitment <work>/round-commitment.json --source <work>/bundle` | 0 | Verified successfully as a Provably Fair round proof. |

## Determinism and artifact readback

```text
77b53e0efb8c41eef1768849ae02fea1894bbc2a3e5d7d054dbb1b521098fd27  sampled-library.json
77b53e0efb8c41eef1768849ae02fea1894bbc2a3e5d7d054dbb1b521098fd27  sampled-library-repeat.json
7ecc909650737b265f257e01314104fc2b079bd83e6268c863bc0516a08ddba8  certification/samples_base.jsonl
7ecc909650737b265f257e01314104fc2b079bd83e6268c863bc0516a08ddba8  certification-repeat/samples_base.jsonl
```

The two seeded `outcomesource sample` responses had equal `outcomeId` and
equal `artifact`. The two certification manifests had equal
`evidenceContentHash`:

```text
sha256:dbcf7acdb5a6e31d92265acaedf33b9839e557b43fdebd7417eb6ff9cb188898
```

The emitted proof read back its commitment hash as:

```text
sha256:d8d02a76d00a317b7af593fde88f01c2af1c8f80b58e5e507450c48bf2a68f91
```

## Copied-artifact negative cases

Only copies made after the successful lifecycle were changed.

| Copy and public verifier | Exit | Actionable diagnostic |
| --- | ---: | --- |
| Appended `corrupted evidence` to copied `samples_base.jsonl`; `<cli> certification verify <work>/tampered-certification --source <work>/bundle` | 1 | `certification-evidence-bundle-samples-hash-mismatch`; also reports count and invalid-JSON line details. |
| Changed only `generatedAt` in copied bundle `manifest.json`; `<cli> certification verify <work>/certification --source <work>/stale-bundle` | 1 | `certification-evidence-verify-source-bundle-manifest-changed`: source manifest no longer hashes to the recorded value. |
| Changed only `serverSeed` in copied `round-proof.json`; `<cli> fairness verify <work>/tampered-round-proof.json --commitment <work>/round-commitment.json --source <work>/bundle` | 1 | `fairness-round-proof-server-seed-mismatch`: revealed seed does not hash to recorded server-seed hash. |

No generated project/output tree, copied tampered tree, browser data, PID file,
tarball, installation, raw log, or automation script is retained.
