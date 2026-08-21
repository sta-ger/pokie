# P6V closeout baseline and matrix

## Frozen starting product

This closeout work starts at the clean, published Phase 6 follow-up product
commit `5e85ae68710133a52e6c407824458cb4006c9f16` (`merge task
task/P6T-01-20260821083907`). It is an ancestor of this documentation/evidence
cleanup commit. The SHA is a product baseline, not a claim that any historical
candidate evidence was captured on it.

The P6, P6R, and P6T roadmaps and their reports, checkpoints, publication
records, and Git history remain immutable. This file is a new P6V record; it
does not amend their status or conclusions.

## Literal criterion matrix

Only P6V-01's immutable instruction was supplied when this baseline was
created. P6V-02 through P6V-06 have no supplied immutable criteria at this
baseline, so the matrix records that fact rather than inventing criteria or
claiming their completion.

| Step | Literal criterion | Evidence class at the frozen baseline | Required next action / defect status |
| --- | --- | --- | --- |
| P6V-01 AC1 | A concise immutable closeout matrix records the exact starting product SHA and separately lists every criterion in P6V-01 through P6V-06. It distinguishes existing evidence, evidence that must be freshly reproduced, and a real product defect; no prior campaign status, state, checkpoint, report, publication record or Git history is rewritten. | This matrix is the new index. Existing: the P6-01 policy in `../phase6-final-polishing/README.md`; the immutable P6/P6R/P6T records; the retained P6-08 root transcript/checksums and four surface screenshots; and the retained P6-10 rendered transcripts/screenshots. Fresh: current-SHA product verification must not reuse those candidate-scoped records. Real product defect: the independently recorded P6-08 P1 failure was a Studio build/parity defect; its historical finding is not relabelled as a current result. | Fresh verification is still required for every product claim. No historical record is edited by this step. |
| P6V-01 AC2 | Generated package trees, tarballs, package locks, PID files, huge terminal transcripts, repeated failed-attempt captures and duplicate artifacts committed under the Phase 6 product evidence directories, including the confirmed P6-08 and P6-10 excesses, are removed through an ordinary Git commit. Only a bounded human-readable index, machine-owned result summaries and minimal representative rendered proof remain; source, tests and real product fixtures are not deleted as evidence cleanup. | Existing retained P6-08 set: its index, source Blueprint fixture, concise cross-surface transcript, checksum summary, and four distinct surface screenshots. Existing retained P6-10 set: its index, four concise rendered transcripts, and five distinct workflow screenshots. | This commit removes the two P6-08 generated-host trees (including three tarballs, locks, generated package output, PID/profile data, scripts, logs, duplicate screenshots, and failed captures) and P6-10's generated project/output trees, logs, debug captures, runner script, and broad terminal transcripts. No production source, executable test, or fixture used by a test was removed. |
| P6V-01 AC3 | An independent reviewer compares the retained set with the P6-01 evidence policy and the immutable P6/P6R/P6T roadmaps, rejects broken links or lost unique proof, and confirms both repositories remain clean and exact before the next fresh verification starts. | Existing: P6-01's bounded-evidence policy and P6R/P6T traceability records identify the retained records. Fresh: an independent reviewer must check this cleanup commit, all retained links/proof, and the supplied companion repository if one is in scope. | Pending independent review. This implementer has no companion workspace authority and does not make the independent-review or two-repository-cleanliness claim. |
| P6V-02 | No immutable criterion was supplied at this frozen baseline. | No evidence is classified for an unknown criterion. | Await the immutable P6V-02 instruction; do not infer a product result. |
| P6V-03 | No immutable criterion was supplied at this frozen baseline. | No evidence is classified for an unknown criterion. | Await the immutable P6V-03 instruction; do not infer a product result. |
| P6V-04 | No immutable criterion was supplied at this frozen baseline. | No evidence is classified for an unknown criterion. | Await the immutable P6V-04 instruction; do not infer a product result. |
| P6V-05 | No immutable criterion was supplied at this frozen baseline. | No evidence is classified for an unknown criterion. | Await the immutable P6V-05 instruction; do not infer a product result. |
| P6V-06 | No immutable criterion was supplied at this frozen baseline. | No evidence is classified for an unknown criterion. | Await the immutable P6V-06 instruction; do not infer a product result. |

## Retention boundary

The P6-08 root index remains self-contained: every file it names remains at
that root. The P6-10 index's retained rendered files remain at its original
paths. The removed trees were generated copies or diagnostics and are
recoverable from their ordinary Git history; they are not moved into another
evidence directory or replaced with newly generated proof.

The next verifier must reject this closeout if a retained relative link is
broken, if a removed generated copy was the sole proof of a distinct claim, or
if either scoped repository is dirty or no longer at its declared SHA before a
new verification run starts.
