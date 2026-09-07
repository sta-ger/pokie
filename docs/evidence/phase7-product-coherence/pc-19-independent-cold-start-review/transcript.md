# PC-19 recovery transcript (concise)

Candidate archive SHA-256: `07053aad46507e453d0fadd04a18cf47e03031cceb6d1a80ae49ee5735b509ad`.

## Rendered public workflows

Fresh candidate-source Studio (`node ./dist/cli/pokie.js --no-open`) rendered a
ready Create game control, then `Your game was saved`. A new Play session
rendered enabled `Spin`; one activation rendered `Round complete`. Simulation
rendered its 10,000/10,000 report. Session Spin selected a recorded round and
rendered its local inspector. Game Model rendered the saved reel/paytable model.
The exact base Outcome Library action rendered `Generated 1,024 outcomes`.
The Outcome Library and PAR card builds each used a focused native picker and
then rendered their own ready/complete card state. Closing then reopening the
saved project rendered the restored Overview workspace.

An isolated consumer installed the retained archive and served
`fixture-slot.html`. Its player rendered scenario/feature controls at 1280x800
and 390x844; no rendered product error appeared. The screen stayed operable
after the scenario panel opened.

## Archive CLI workflows

The archive-installed CLI successfully validated the saved Blueprint; built the
1,024-outcome exact library, Stake adapter, and PAR workbook; imported and
validated the PAR Blueprint; simulated 1,000 outcome-library rounds; replayed
round 1; and completed fairness seed-commit, commitment, reveal, and verify.

## Finding PC19-P2-EXACT-OUTCOME-MEMORY

Ready action: public archive CLI `build random.blueprint.json --target
outcomeLibrary --exact`. It printed `Build preflight: 614656 estimated item(s),
629407744 estimated bytes` and accepted the operation. Its terminal output was
`FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed -
JavaScript heap out of memory`; no output library was published.

The independent public archive CLI `generate random-package --exact --progress`
likewise rendered progress through `614656 / 614656` then terminated with the
same fatal OOM (exit 134), leaving no output library. These are action-local
terminal results of the accepted commands, not an earlier page error or a fixed
wait timeout. No retry was sent after either accepted operation.

The verifier-owned freeze receipt bound this finding list, candidate SHA, and
archive digest. When supplied to the PC-19 validator, it correctly rejected a
release-complete record because no complete `PROVENANCE.json` exists while this
material P2 remains open.
