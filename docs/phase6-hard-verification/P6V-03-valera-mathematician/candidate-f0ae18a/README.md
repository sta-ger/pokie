# P6V-03 candidate `f0ae18a` fresh rendered rerun

Candidate verified before build and launch: `f0ae18a40164fc282beb0c9a0336e07f9de4b627`.

One fresh Studio launch used exactly `node ./dist/cli/pokie.js --no-open` from
this checkout after `npm run build`.  It used a newly-created disposable
`HOME`/Studio registry and a separate visible Chromium profile.  The rendered
Projects page said **“No projects yet -- import or design one below.”** No
documentation link, source file, private API, DOM/state injection, or
prewritten UI automation procedure was used to drive the browser; every
interaction below was a pointer/keyboard action on a rendered control.

## Rendered transcript and checklist map

1. **Fresh design / identity.** Opened rendered **New Blueprint**, selected
   **Recommended**, and set Game id to `valera-mathematician` and Game name to
   `Valera Mathematician`; the rendered validation initially said **Valid — no
   issues found**.
2. **Layout and paylines.** The rendered Layout showed 5 reels × 3 rows and
   three paylines.  **Add payline** was accepted; the Layout tab then showed a
   warning badge (the duplicate-line warning is rendered later on the Bets
   view).
3. **Symbols / artwork.** The Symbols view exposed A, K, Q, and J and the
   rendered Wild control was used for A.  Its visible **Select PNG** control
   was pressed once, but no native picker rendered, so no artwork outcome was
   confirmed.  This action was not retried.
4. **Literal and generated reels / constraints.** The rendered Reel strips
   view showed literal A/K/Q/J strips.  Then the visible **Symbol weights**
   generator was selected and explicit rendered weights `A=1`, `K=1`, `Q=1`,
   and `J=1` were added.  The generator rendered the expected validation
   warnings.  No rendered stack/constraint editor was reached before project
   creation failed.
5. **Paytable and bets.** The Paytable view rendered the current A/K/Q/J
   payout rows (for example A 3/4/5 = 10/20/40); the Bets view rendered
   1/2/5 and accepted a new bet `10`.
6. **Creation boundary (finding).** One visible **Create Project** action
   immediately rendered **“The project could not be found. Check the path and
   try again.”** The non-idempotent create was not repeated.  Projects still
   rendered empty afterward.
7. **Unreachable checklist items.** Because Studio did not create/open the
   project, workspace-only Modes and Mechanics persistence, save/reopen,
   Play wins/features, Simulation, Replay/export, Outcome Library output, and
   Stake Engine artifacts were not reachable.  They are not claimed.

## Minimal proof

| File | Rendered state | SHA-256 |
| --- | --- | --- |
| `01-fresh-empty-registry.png` | Newly isolated registry: no projects | `7eb7bf03bfa5df3c7d87fdfbffd76768ee61a91d93fbe106991b843883edc26d` |
| `02-generated-reels.png` | Generated Symbol-weights controls after A/K/Q/J entries | `8e1d2b96bec414d100c9a3a2c68c10010f8c84703986d9a8158877e28912c05a` |
| `03-create-project-error.png` | Rendered Create Project error | `5c81f3b5c809038b49100a365bc3fd753a285cf23086a7daf2c924403b51d818` |

The retained delta is this README and three screenshots (304 KiB total).  No
Studio output, browser profile, generated project, build output, or harness is
committed.
