# Generation 8: rendered-workflow recovery

Candidate product source: `7e4bf7cd1178fe59a29f924bb72e92b379b6d444`.
This evidence-only checkout is its descendant; the candidate-built CLI remains
`ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`.

One new-profile Studio launch used exactly:

```
node ./dist/cli/pokie.js --no-open
```

The candidate CLI created a temporary saved design, then the visible Studio
**Browse…** action opened its rendered **Server filesystem browser**.  From
the ready `POKIE Projects` entry, one activation rendered the action-local
accepted state **Loading directory…**.  No file listing, local error, job, or
terminal result rendered during the bounded observation, so that saved-design
Browse → Load → Save → durable-Projects delta remains **inconclusive (driver)**
rather than a product finding.

The same fresh journey then visibly closed that picker and completed the
otherwise reachable public workspace route: **Create game** showed its local
saved/opening message and then the workspace; **New Play session** → **Spin**
rendered pending then **Round complete**; **Run Simulation** rendered queued
then completed; Game Model, Replay, and Build/Export rendered, with the latter
showing its artifact preflights; **Close project** then **Your projects**
rendered a durable Starter Slot entry. No action-local product failure was
observed.

The transient browser profile, temporary source JSON, generated workspace,
screenshots, and raw transcript are intentionally excluded. The raw transcript
SHA-256 is:

```
81243a82c18f7c241ba890ee68459ecd5d868f280ba7201b3147ff1611db9ef4
```

## Saved-design continuation: 2026-09-07

One further fresh-profile Studio launch again used exactly
`node ./dist/cli/pokie.js --no-open` from this candidate descendant. The
candidate CLI first created a disposable `PC19 Saved Design` blueprint. The
visible **Browse…** control opened its rendered server filesystem browser and
the visible `POKIE Projects` entry accepted the activation with its local
**Loading directory…** state. It did not render a listing or a local terminal
error in the bounded observation, so that wait was not treated as a product
failure. The picker was cancelled once; Studio's rendered **Load from path**
control then visibly contained the disposable absolute path.

The one visible **Load** activation rendered `PC19 Saved Design` in its local
Game id/name control. The one enabled **Save game** activation subsequently
rendered its workspace, and after **Close project** the rendered Projects view
contained the durable `PC19 Saved Design` entry. The same journey also reached
Game Model, Play (new session → `Spinning…` → `Round complete`), Simulation
(`queued` → completed report), Replay, and Build/Export preflights. No
action-local product failure was rendered. The temporary blueprint was removed
after the launch; profile, registry, workspace, screenshots, and raw transcript
remain outside retained evidence. Raw transcript SHA-256:

```
d0a855058b094e8893db3ad098118e261c253433dd8476e7f69c44926cf3b934
```

This closes the saved-design Browse → Load → Save → durable-Projects delta.
It does not convert PC-19 into PASS evidence: the reviewer-required external
freeze receipt and the complete independent charter remain unavailable.

## TypeScript package opening defect: 2026-09-07

In a new Studio profile launched exactly with
`node ./dist/cli/pokie.js --no-open`, the visible **TypeScript Game Package**
card rendered its enabled **Build** control. One activation rendered the
action-local `Building` state and then `Built to /home/stager/POKIE
Projects/tsPackage`. The same card then rendered its own enabled **Open as
Project** control, which was activated once.

That activation immediately navigated to a workspace whose local Overview
identified `/home/stager/POKIE Projects/parWorkbook.xlsx`, `Game format: PAR
spreadsheet`, and `Invalid — 1 error(s)`: `pokie-package-load-failed` because
Studio tried to read `parWorkbook.xlsx/package.json` (`ENOTDIR`). It never
rendered the just-built TypeScript package as the promised openable project.
This is a synchronous, action-local artifact-interoperability failure, not the
earlier picker readiness observation.

Action correlation: action = `TypeScript Game Package — Open as Project`;
ready state = `the same built TypeScript-package card exposes its enabled Open
as Project control`; accepted state = `the exact control immediately replaced
the card with its opened-project workspace`; terminal state = `the workspace
rendered the unrelated PAR workbook and its local package-load error instead
of tsPackage`; synchronous terminal = `true`.

No generated package, project tree, screenshot, profile, or raw log was
retained. The transient rendered-workflow transcript SHA-256 was
`f0bc870cd524956255ae14a54491edb30b3253df5dbc7597a89b30ee6046e7d7`.

## Retained-evidence revalidation: 2026-09-07

One fresh-profile replay of the same repaired candidate-bound journey retained
the same local outcomes: rendered **Load** selected `PC19 Saved Design`, one
**Save game** opened its workspace, **Spin** settled at `Round complete`,
Simulation completed after its local queued state, and Projects rendered the
durable `PC19 Saved Design` entry. Its transient transcript SHA-256 was
`7a59d189ccffb5d237fb215884a4949e6da371dd8232a57e28fac0cadd84609a`.
No additional parity or artifact-interoperability boundary was completed, so
this is validation of the retained saved-design delta only, not PASS evidence.
