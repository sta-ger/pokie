# P6V-05 independent host verification — picker-driver inconclusive

Product candidate: `caf8132177b23abc34096c6c3ce4079330b34080`.
Read-only companion candidate: `1e2c8c00457f3af389c0168432c08e63ca441465` (clean before and after).
The product was rebuilt successfully, then fresh Studio/Chrome state was launched from this checkout
as `node ./dist/cli/pokie.js --no-open`.

The visible **Projects → Import Project → Browse PAR sheet…** control opened a real Zenity picker.
The picker was activated and confirmed active before entering the physical source workbook
`examples/parsheets/starter.par.xlsx` (SHA-256
`a2e88ad5962551e8be9b2710b141965cfbae354ca8e9f254b6e9f53a9f9b4924`). After its Enter action,
the directly labelled rendered **Location** input was still empty. Its picker control remained
unavailable, so the permitted idempotent retry could not be issued. No Studio success, error, or
native-picker response rendered; this is therefore driver/readiness-inconclusive, not a product finding.

The bounded rendered screenshot was retained only in the controller-owned harness and has SHA-256
`a294a2f373987f9140df37862ff740e119353b0a4993a19395b78dbece33afed`; it is intentionally not
committed. Because no valid PAR import completed, the edit/save/export/reimport comparison and the
companion `npm start`/Studio Play/public client-dev/Replay/CLI Replay parity matrix were not reached.
No generated workbook, profile, log, harness, or product artifact is retained in this evidence commit.
