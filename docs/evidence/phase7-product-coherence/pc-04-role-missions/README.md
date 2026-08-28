# PC-04 independent exact-candidate role-mission rerun

Candidate: `44262bae4fd557c33ab64631714b929b3e3ff313`. This checkout has no
product-file diff from that candidate (its HEAD is an evidence-only descendant).

Before reading source or retained evidence, a fresh registry and six fresh
Chromium profiles rendered Studio for analyst, modeler, runtime operator,
simulator, outcome owner, and Stake deployer. Every context rendered `Start a
game · POKIE Studio`.

In a separate fresh Studio launch from this checkout, exactly
`node ./dist/cli/pokie.js --no-open`, the visible `/home/projects` navigation
rendered the Projects orientation and its empty-project guidance. Entering the
nonexistent `/definitely-not-a-pokie-project` and choosing **Check game**
rendered the concrete missing-path error. Replacing it with the real generated
runtime package and choosing **Check game** replaced that stale error with
`Found a Playable game` and **Add to projects**.

The public CLI created a real blueprint, exported/imported its PAR workbook to
an editable model, built a TypeScript runtime package, and completed a
100-round seeded simulation plus JSON report. The editable model built an exact
91,125-outcome library, passed `validate --deep`, and built a Stake export. A
generic `import <stake> --format json` passed `inspect` and `validate --deep`;
its generated `config.json` re-exported to a valid Stake adapter. No rendered
or CLI product error was observed.

Artifacts remain in the verifier harness; only representative checksums are
retained here.

| Artifact | SHA-256 |
| --- | --- |
| PAR-imported editable blueprint | `4e7658c0b5ae845f82d9d35f5f7522ac904484a9a4507261b28d0379f8743386` |
| seeded simulation/report JSON | `920b6cb14929d68c6b8c87435b4ddf33dae77801d90f62419e5dc3b712e87c75` |
| exact Outcome Library manifest | `18f2003d36b192eb557932067ec7726ebc9220e079b184f0f411e3bf16ec42e6` |
| generic-import `config.json` | `7a712b766eeedb68cb4f948147859861b633b172e665ad4b3db8fdc9b6ee0ec6` |
| `config.json` Stake re-export manifest | `f5d7c6d254cbd8c534e26d92f3e00f279f4680c7bfdc9299ea3972e6b5759944` |
