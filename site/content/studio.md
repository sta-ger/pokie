# Studio and durable jobs

## Find your project

Run `pokie` for global Home or `pokie PROJECT` for a specific project. Home offers Design, Open and Projects. **Design → Create game** saves an editable Blueprint; opening a package preserves its code-first identity. **Overview** reports structural validity and support. **Game Model** shows the effective model; Play, Simulation and Replay consume runtime capabilities rather than inferring them from the filename.

## Edit and save

In a Blueprint workspace, edit the design, inspect validation, then **Save game** to persist it. **Build/Export** previews a target and its diagnostics before explicit build to a new destination. Saving a draft, preparing a runtime and building an artifact are distinct operations. In a custom package, use the capabilities offered by that package; unsupported editing is explained rather than silently converted. CLI `pokie edit PROJECT` follows this same boundary.

For [extraction](extraction.md), choose Blueprint in Build/Export, preview, **Save Blueprint**, then **Open as Project**. For [whole-sequence editing](weighted-sequences.md#studio-editing), Apply changes the draft; Save game persists it. **Overview → Optimize math** reviews candidate changes before separate save or apply.

Structural validation errors and warnings stay visible while you author. The compact declared-model analysis status is separate: open **Show model analysis details** to inspect checks, assumptions, limitations and work budgets. An inconclusive analysis does not prove the model's mathematical properties.

## Simulate, play and replay

In Simulation, choose a supported mode, bounded rounds, worker count and explicit seed, then run and inspect the retained report. Export that report rather than assuming the current Play state is simulation evidence. Play owns a live in-process session; it does not start `serve`. Replay loads compatible replay evidence or runs the selected seed/round path. Unsupported operations remain visible with actionable diagnostics. [Validate, sim, report and replay](reproducibility.md) explains the evidence types.

## Observe and cancel work

Long-running operations have durable job IDs, project identity, phases and progress. Reload reattaches to server-owned work; it must not automatically submit another run. Cancel from the owning project; cross-project cancellation is rejected. **Cancelling** remains pending until workers, runtime resources and scratch candidates have drained. Cleanup failure requires recovery and cannot be presented as successful cancellation.

Retained cards keep the outcome, warnings, output actions and any explicit recovery action visible. Open **Operation details** for timing, provenance, the operation result and the captured request. This disclosure does not submit or retry work.

Server restart preserves durable evidence and operation-specific interrupted/retry states. It cannot recreate a live Play session, resume optimizer search or restore its process-local candidate save/apply authority. Rerun support and optimization to get a new review receipt. The generic recovery endpoint only resumes generation operations that explicitly support recovery. Do not assume every retained job can resume.

## Keep ownership distinct

Saved Blueprint drafts are authored files. Simulation reports and audit exports are evidence. Runtime sessions are process state. Optimizer candidates are detached owned workspaces until explicitly published or applied. A saved report does not save a design, restore a session or grant mutation authority. Project switch/close and shutdown cancel and drain owned jobs before releasing resources.

If the connection fails, reconnect and inspect the retained job before retrying. After a destination conflict, choose a new path. After source/policy drift, obtain fresh support and review. See [job recovery source guide](../../docs/studio-long-running-jobs.md) and [Studio source guide](../../docs/studio-frontend.md).

## Read a simulation result

Review starts with result metrics, warnings and precision status. **Open full report**
replaces that summary; **Show sampling and precision**, **Show analytical tables and
feature detail** and **Show run identity and accounting** reveal supporting information.
Each mode retains its own results. Comparison shows the selected pair, and Export
keeps JSON, Markdown and HTML downloads tied to the original report.
Within run identity and accounting, **Reproduce this run** reveals the original
command, model/config hash and runtime version when the report includes them.

Path checks show **Location needs attention** with the specific problem and a
suggested correction. Edit the location or use Browse to choose another. A new
artifact destination can be absent; its availability and overwrite policy are
checked by the submitting action.

In Layout, paylines have numbered path cards. Open **Edit reel rows** to edit a
line's zero-based, evaluation-local row numbers. Leaving a field updates the draft;
Save/Apply or Create game remains explicit.
