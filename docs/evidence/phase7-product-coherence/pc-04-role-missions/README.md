# PC-04 — blind role missions

This directory records six separately started, public-surface-only product
missions. A collector received only the stated role goal and began with the
installed `pokie` help or Studio landing page. They did not receive a workflow,
source-tree location, test name, prior finding, or a prepared input.

| Role | Starting goal | Transcript | Result |
| --- | --- | --- | --- |
| Math designer | Turn a PAR workbook into an editable model, runnable game, and simulation report. | [01](01-math-designer.md) | Completed with real workbook, Blueprint, runtime, simulation, and report files. |
| Game developer | Make a small game package from a new design and confirm local play. | [02](02-game-developer.md) | Completed; a quoted-path obstacle was retained. |
| Frontend developer | Take a package to the browser-facing local player. | [03](03-frontend-developer.md) | Completed; service/client recovery recorded. |
| QA investigator | Determine whether public validation/import failures are recoverable. | [04](04-qa-investigator.md) | Two recovery defects retained. |
| Integration developer | Produce, deploy, and reuse Outcome/Stake artifacts. | [05](05-integration-developer.md) | Completed with real persistent artifacts. |
| Developer opening another project | Determine a colleague project’s state, stale outputs, and recovery. | [06](06-opening-another-project.md) | An orientation defect retained. |

## Boundary

- Candidate: installed public `pokie` 1.3.0, Node 24.18.0, 2026-08-27.
- Every role used a fresh temporary directory and, for Studio, a fresh browser
  profile. Paths in transcripts are independent-run paths, not this checkout.
- `Created` means a file written by a public product command or visible Studio
  action; `read` means selected through a public command or control.
- Temporary workspaces/profiles were discarded after capture. The records keep
  the natural action, observable output, file identity, obstacle, and recovery.

The transcripts are role-oriented rather than a prepared happy path. Failures
remain findings and were not repaired using private product knowledge.
