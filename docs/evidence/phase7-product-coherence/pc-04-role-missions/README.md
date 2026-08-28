# PC-04 independent role-mission rerun — 2026-08-28

Requested candidate product commit: `e5e2b31ec5d200b8ad4ae620f115357e3d454fcc`.
The supplied checkout HEAD was `ec33b37edc8122eadd068796c97b10d3c8034f1c`;
the requested commit is its ancestor and the intervening changes are confined to
this evidence directory.

## Fresh rendered run

Before reading product source or earlier evidence, the controller-retained public
workflow driver was executed directly from its assigned isolated harness. It
started Studio from this checkout with exactly:

```
node ./dist/cli/pokie.js --no-open
```

Studio reported it was listening on `http://127.0.0.1:3200`. The fresh Chromium
profile then rendered the requested initial route
`http://127.0.0.1:3200/home/projects` as:

```
{"error":"Not found: /home/projects"}
```

The rendered page had no controls. After more than twelve minutes awaiting the
retained driver's semantic checkpoints, no later rendered success or recovery
state appeared. The blocked run was interrupted rather than launching a
duplicate workflow.

## Bounded proof

The ephemeral rendered snapshot was not retained. Its checksums, recorded before
cleanup, were:

| Artifact | SHA-256 |
| --- | --- |
| `ui-initial.json` | `c4d2f822390ca25bb677e8072bdc84587ccb73f813e0ca36f641b8e281c2097b` |
| `ui-initial.png` | `119c7d55a4952f0cd82a70c5fa75c137cfb60d1a0170fb8fdd8cdb243ee9527d` |

This route failure prevented all six role contexts, the PAR/runtime journey,
Stake import/re-export, and Studio stale-state/recovery observations from being
reached in this fresh run.
