# Developer-opening-another-project mission

**Starting goal only:** “A colleague left me a POKIE project. Open it, work out
where it is in its lifecycle, see whether old artifacts are trustworthy, and
recover anything that is stale.”

**Fresh context:** new Studio browser profile and managed-project directory.
The only handoff was `/tmp/pc04-colleague-project-M8sL/`. The role used `pokie
.` and visible Studio controls; it was not told the project type, prior
workflow, expected screens, source layout, or a recovery recipe.

| # | Visible/product action | State, stale-artifact result, and recovery | Created or read |
| --- | --- | --- | --- |
| 1 | Started Studio through `pokie .`; chose **Open existing project** and selected colleague directory. | Dashboard showed project name, Blueprint validity summary, and Game Model, Play, Simulation, Replay, Build/Export actions. | Read: colleague Blueprint/project directory through Studio. |
| 2 | Opened **Overview** and **Game Model**. | Validation showed valid-with-warning and named the advisory; editable model established this was a Blueprint, not a deployed package. | Read: visible Blueprint model. |
| 3 | Opened **Build/Export**. | Existing Outcome/Stake result had an older model fingerprint. Studio marked it stale and did not present it as current deployment output. | Read: stale Outcome/Stake artifacts via Studio. |
| 4 | Selected stale-result recovery action; rebuilt current Outcome Library, then exported Stake. | New Outcome and Stake artifacts were created for the current model; result panel offered next actions. | Created: refreshed Outcome Library and Stake export files. |
| 5 | Ran short seeded **Simulation**, then opened **Replay**. | Report and replay were available for the rebuilt result, connecting model, runtime evidence, and freshness without filesystem detour. | Created/read: simulation report and replay files. |
| 6 | Closed and reopened via Studio’s **Projects** list. | Project reopened at dashboard; refreshed artifacts remained associated. | Read: managed registry and refreshed artifacts. |

## Product-coherence defect

**PC04-OPEN-01 — missing orientation when stale results exist.** The visible
stale marker says an artifact is not current, but does not say whether to
rebuild the Outcome Library, re-export Stake, or both, nor connect that choice
to the available next actions. The role discovered recovery only by exploring
the Build/Export controls. This is a product-orientation defect, not private
context supplied to the role.

Project state, available actions, stale artifacts, and recovery were determined
through Studio. No source inspection occurred before the defect was recorded
and recovery completed.

`SOURCE INSPECTION: not performed before completion.`
