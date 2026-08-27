# P8-04 independent fresh-profile authoring rerun

Product candidate: `cce79716790ae3cfc8d6f5c095fbc08426386e56`
Evidence-only starting descendant: `83c97a421683ac0ab1223e15b49fc63f7fdc6377`
Date: 2026-08-27

The candidate source was unchanged between those revisions except for this
evidence location. Four new, fresh launches used the candidate checkout command
`node ./dist/cli/pokie.js --no-open`, each with a newly-created Studio HOME and
Chromium profile. The retained candidate build was therefore the one exercised;
no `node_modules/.bin/pokie` executable was used.

## Rendered outcomes

- Required/optional metadata guidance, **Choose a different start**, and **Use
  the starter game** rendered in every run. Latest timing: Studio listening
  1379 ms, Chromium ready 480 ms, guided editor 307 ms.
- After repairing pointer focus with real X11 keyboard traversal, `Game id` was
  reached in nine visible Tab steps. Clearing it rendered the field-local,
  actionable error `"manifest.id" must be a non-empty string.` and `Invalid — 1
  error(s).`; after entering a new ID and name, Studio rendered `Valid — no
  issues found.` in 667 ms.
- No rendered Studio error, console warning/error, or material network failure
  appeared. Each run saw only two `GET /favicon.ico` 404 responses.

## Bounded recovery result

The first two launches reached the starter editor but pointer focus did not
arrive at `Game id`; the third proved the repaired Tab route and then exposed a
harness omission (selected text was not deleted for an empty replacement). The
fourth repaired that omission and achieved field-specific validation and valid
correction. It then stopped before the destructive-layout step because the
harness looked up the rendered `Layout` tab by exact text even though Studio
appends a status badge to its accessible name. The harness is repaired in place
to use semantic-prefix tab/action lookup, but the four-launch limit was then
exhausted. This is selector/driver inconclusive rather than a product defect;
the reel-reduction, save/reopen, and workspace-continuation portions were not
reached.

No screenshot is retained because no destructive-confirmation or saved-project
outcome was reached. No profile, project tree, browser automation, or raw log
is retained. The discarded bounded result JSON checksums, in launch order, are:

- `ed97d9eeefcf0da2b3414ea107585bfb1f96f4d246570b83bb7e6a95ef43b4ea`
- `cc5fa2d3c7210d853e006f66860402bd88b54f6a6be4f5d9ebe9a3a378d70e78`
- `622b75535eb6b7ea2a18b3d650b7234562c80dfbca771ebd28788a30bcf0f6c1`
- `ddbf8c8b2aee2bafafba96b2b8ae8fd79327cfce4dbd2097b10fa37e601ba4eb`
