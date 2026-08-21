# P6V-01 independent retained-evidence audit

Candidate audited: `768849aee11881c653a4c224603e8aacb64123e2`.
This is a new P6V record; no P6, P6R, or P6T roadmap/report was changed.

## Scope and policy check

The candidate retains the P6-08 root index, minimal fixture, concise
cross-surface transcript, checksum summary, and four distinct surface images.
It retains the P6-10 index, four rendered browser transcripts, and five
rendered images.  The retained files are bounded: the largest is 349,532 bytes;
the P6V directory contains two text records and is 20 KiB on disk.  The
candidate removes generated project/package trees, tarballs, profiles/PIDs,
automation, raw logs, and broad terminal captures, as required by the P6-01
policy.

The immutable P6 and P6R/P6T record directories are unchanged from the
candidate parent: `docs/phase6-final-polishing` changed 0 files and
`docs/phase6-completion-remediation` changed 0 files.  The frozen P6V product
baseline `5e85ae68710133a52e6c407824458cb4006c9f16` is an ancestor of the
candidate.

## Link and proof result: finding

All 63 Markdown/text records in the retained P6/P6R/P6T/P6V and affected
P6-08/P6-10 scopes were checked for relative Markdown links: 0 were broken.
All seven P6-08 and all nine P6-10 files explicitly retained by their indexes
are present.

However, `tests/cli/studio/simulation/evidence/P6-10/README.md` still names
`terminal-transcript.txt` as the record of public CLI preparation and
`build-transcript.txt` as the record of the build/environment observation.
Both paths were deleted by this candidate and no retained replacement provides
those two claimed records.  The historical P6-10 index consequently makes two
unresolvable file references and its preparation/build proof is lost.  This
does not establish a product-behaviour regression; it fails the retained-proof
and repository-exactness acceptance criterion.

## Exact repository state at audit

| Repository | Path | HEAD | `git status --porcelain` |
| --- | --- | --- | --- |
| pokie candidate | this worktree | `768849aee11881c653a4c224603e8aacb64123e2` | empty |
| pokie-examples companion | `/home/stager/Work/sta-ger/pokie-examples` | `b7b043e0e722da917f1b60c4f107c8cc35fdd725` | empty |

No expected companion `head_sha` was supplied in the persisted request, so the
second row records the exact clean checkout observed rather than asserting a
match to an unstated target.
