# P6V-06 independent final audit — verification required

Audited candidate: `3f521b978b10859648c1890a5a48b9eaf4643ffb`.
This audit is intentionally fail-closed.  It records the exact candidate that
was examined before this audit record was added; it neither runs the
controller-owned release gate nor makes a publication, push, or Drive claim.

## Immutable closeout matrix

| Step | Exact-candidate evidence result | Bounded-hygiene / finding result | Final-verifier outcome |
| --- | --- | --- | --- |
| P6V-01 | The retained-evidence audit was run on `768849aee11881c653a4c224603e8aacb64123e2`, not this candidate. Its P6-10 index finding was corrected by `d2512414`; the current P6-10 index no longer claims either removed transcript. | The prerequisite record and its correction are retained. This audit did not rerun the retained-evidence review on `3f521b9`. | **Verification required** — an older audit plus a later textual correction is not an exact-candidate independent rerun. |
| P6V-02 | The rendered audit is bound to `540a60ebd2a1f3a5c9d4cdf0bfcde96f8085b4b0`, an ancestor of this candidate. | Its bounded record reports no P0, P1, or material P2 on that older SHA. | **Verification required** — no fresh P6V-02 browser rerun is bound to `3f521b9`. |
| P6V-03 | The final independent passed rerun is bound to `adf692fad3b98fe327f06f3c2de0101bbe334dd6`, an ancestor of this candidate. | It records all required rendered paths and no unresolved P0, P1, or material P2 on its candidate. Earlier P1 and inconclusive records remain historical evidence, not current approval. | **Verification required** — no final independent rerun is bound to `3f521b9`. |
| P6V-04 | The Producer rerun is bound to `bc810a69dba8ee4e036906fd9c10dda9fefb5680`, an ancestor of this candidate. | Its compact record reports no P0, P1, or material P2 on that older candidate. | **Verification required** — no exact-candidate rerun is retained. |
| P6V-05 | The PAR/Player record is bound to product `caf8132177b23abc34096c6c3ce4079330b34080` and companion `1e2c8c00457f3af389c0168432c08e63ca441465`. The current product source tree has no source/test/package delta from that P6V-05 product SHA; this does not make it exact-SHA evidence. | The companion checkout is clean at the recorded SHA. The record reports the physical PAR and five-surface Player matrix passed. | **Verification required** — source equivalence cannot substitute for a P6V-06 exact-candidate rerun. |

All cited product commits are ancestors of `3f521b978b10859648c1890a5a48b9eaf4643ffb`.
The corrected P6V-01 index and the archived earlier P6V-03 findings were
traced so that historical failures are not misrepresented as current
unresolved defects.  Nevertheless, their successor records are candidate
specific and cannot establish the required one-to-one final verdict on this
candidate.

## Release and completion gate

`check:release` is the controller-owned composite command:

```text
npm run lint && npm run typecheck && npm run test:coverage && npm run test:packaging
```

It has not been run for `3f521b978b10859648c1890a5a48b9eaf4643ffb` in this
implementation task, and no P6V-06 saved gate result exposes its packaging
subcommand.  Therefore this record does not assert unit, integration,
workflow, packaging, or post-gate child-process success.

No controller post-merge-tree verification, clean `develop` push, companion
push, publication of the integrated SHA, or Google Drive round trip is
recorded here.  Those actions require controller authority and must follow an
independent exact-candidate approval and the one permitted release-gate run.

## Completion resolution

`completion_resolution: verification_required`

Completion is unsatisfied.  The controller must retain this fail-closed status
until (1) a mandatory independent verifier freshly reruns and approves every
P6V-01 through P6V-05 criterion on one exact accepted SHA, (2) `check:release`
runs exactly once and saves its successful packaging result, and (3) the
controller records exact post-merge/push/publication/Drive-round-trip results
with `completion_resolution: satisfied`.

## Binding correction (2026-08-24)

The later P6V-06 README incorrectly promoted the closeout to passed by calling
the separate P6V-04 and P6V-05 records machine-owned current-candidate runs.
That assertion is withdrawn. P6V-04 names only
`bc810a69dba8ee4e036906fd9c10dda9fefb5680`; no retained
`run-11-producer` record binds it to the later candidate. P6V-05 names POKIE
`caf8132177b23abc34096c6c3ce4079330b34080` and companion
`1e2c8c00457f3af389c0168432c08e63ca441465`, while its claimed `run-10`
does not record a POKIE candidate SHA.

The correction review starts at POKIE
`782810b91be076b254ae110e0037725101fb90c1`, which is later than the false
passing README and includes a changed targeted integration test after
`cf26cd3110cdf5d3f01deb533efb7b031039d9ed`. The companion remains clean at
the recorded `1e2c8c0` adoption SHA. These facts preserve the prior evidence
and make the missing exact binding explicit; they do not approve either tree.
