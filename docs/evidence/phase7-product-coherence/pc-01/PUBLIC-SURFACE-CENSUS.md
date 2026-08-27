# Public-surface census and ownership ledger

This is an append-only Phase 7 discovery ledger. It is intentionally empty of
source-derived product inventory: a clean-room collector appends one row for
each individually observed public surface, then cites the run artifact that
made the observation reproducible. A row is not verification or a claim that
the product succeeds.

Use statuses `observed`, `not-observed`, `input-required`, `not-generated`,
or `superseded`. Only `observed` means the cited evidence shows the stated
surface. `not-observed` and `input-required` are explicit boundaries, not
coverage. Every row needs a non-empty evidence reference and a future owner.
For a pre-observation boundary row, cite the applicable PC-01 protocol section
and replace it with a run-artifact reference only by appending a later row.

Evidence references use `runs/<run-id>/<path>#<row-or-line-id>` where possible
(for example `runs/20260827T152200Z-pokie-1.3.0/cli/help-index.tsv#C004-init`
or `runs/.../studio/browser-transcript.md#T003`). Multiple references are
semicolon-separated. Public documentation may additionally use its public URL
with a quoted claim in the record. New discovery never edits a previous row:
append it and use `supersedes=<record-id>` in notes where needed.

## CLI records

Append one row for every root flag, verb, subcommand, alias, option, and
bounded parser outcome discovered from installed help/output. A command with
five displayed options produces five option rows; no family-level row can
stand in for them.

| record_id | surface_kind | command_path | spelling_or_alias | metavar_and_default | observed_help_or_diagnostic | status | evidence_reference | future_owner | observed_utc | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CLI-...` | `root-flag` / `verb` / `subcommand` / `alias` / `option` / `parser-outcome` | exact displayed path | exact spelling or alias target | exact display or `none` | exact visible wording/summary | allowed status | help index + stream, or error stream and command row | `phase7-cli-owner` | UTC or `not-yet-observed` | alias canonical path; `supersedes=...` if applicable |

## Studio records

Append separate rows for each page, each actionable control, and each visible
state. An action that lands on an empty state requires at least an action row
and a state row; a page is not treated as evidence that every action or state
on it was reached. Cite matching transcript transition IDs and screenshots
when visual proof is necessary.

| record_id | surface_kind | visible_page_or_control | triggering_visible_action | resulting_visible_state_or_boundary | status | evidence_reference | future_owner | observed_utc | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `STUDIO-...` | `page` / `action` / `state` | exact rendered title, route, label, or state | exact visible action or `initial-render` | exact rendered result, or boundary text | allowed status | transcript row; screenshot path if used; launch command row when relevant | `phase7-studio-owner` | UTC or `not-yet-observed` | include enabled/disabled; `requires=<input>`; `supersedes=...` |

The following required boundary records must exist before a run is called
complete. They deliberately preserve the discovery boundary instead of
inventing an input or a workflow:

| record_id | surface_kind | visible_page_or_control | triggering_visible_action | resulting_visible_state_or_boundary | status | evidence_reference | future_owner | observed_utc | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `STUDIO-BOUNDARY-INPUT` | `state` | first rendered control that requires a product choice, path, or generated input | visible action that reaches it, or `not-yet-reached` | record exact visible prompt; do not supply input | `input-required` | `COLLECTION-PROTOCOL.md#4-render-studio-with-a-fresh-browser-profile` until a transcript row exists | `phase7-studio-owner` | `not-yet-observed` | append a run-backed row when encountered; no scripted workflow |
| `STUDIO-BOUNDARY-UNOBSERVED` | `page` / `action` / `state` | any Studio surface advertised or visibly offered but not reached clean-room | `not-reached` | state why it was not reached | `not-observed` | `COLLECTION-PROTOCOL.md#4-render-studio-with-a-fresh-browser-profile` until a transcript row exists | `phase7-studio-owner` | `not-yet-observed` | one row per later discovery; not covered |

## Advertised artifact records

Append one row for every individually advertised artifact type or format found
in installed public metadata, installed README links, CLI help, or rendered
Studio. A family name (for example “exports”) is not a row. Record separately
each format/type and whether a ledger entry actually proves generation.

| record_id | advertised_type_or_format | exact_public_claim_and_location | producer_command_or_ui_surface | generation_status | evidence_reference | future_owner | observed_utc | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ARTIFACT-...` | exact advertised type/extension/format | exact public wording plus URL or help stream | command id, Studio record id, or `not-observed` | `observed` / `not-generated` / `not-observed` / `input-required` | public claim reference; ledger row if generated | `phase7-artifact-owner` | UTC or `not-yet-observed` | ledger id; boundary; `supersedes=...` |

## Public documentation-claim records

Append one row for each distinct externally visible claim, rather than one per
documentation family. Record literal wording compactly enough to identify the
claim, its public location, and the observable surface that supports, limits,
or has not yet exercised it.

| record_id | claim_topic | exact_public_claim | public_location | related_surface_record_ids | status | evidence_reference | future_owner | observed_utc | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DOC-...` | installation / CLI / Studio / artifact / boundary / other | exact wording | public URL, installed README path, or help stream | CLI/STUDIO/ARTIFACT IDs or `none-yet` | allowed status | public location plus run artifact that supports or limits it | `phase7-docs-owner` | UTC or `not-yet-observed` | discrepancy or boundary; `supersedes=...` |

## Ownership and discovery rule

The future owner is `phase7-cli-owner`, `phase7-studio-owner`,
`phase7-artifact-owner`, or `phase7-docs-owner` according to record family.
A cross-surface discovery cites all applicable record IDs and names
`phase7-product-coherence-owner` as coordinating owner in notes, while keeping
the family owner in `future_owner`.

On the day a collector finds a new verb, option, page, action, state, artifact
type, or documentation claim, append its individual record with evidence,
status, and owner. Do not consult source, prior campaign evidence, or a
prepared success script to fill gaps; record the unobserved/input-required
boundary and hand it to its future owner instead.
