# P6-18 independent cold-start Studio rerun — passed

Candidate: `0fadbd930320539ed6b76308b1728e487c220e6e`
Finding id: `p6-18-mathematician-cold-start-workflow`
Run: 2026-08-19, one fresh local Studio and a separate fresh Chrome profile.

The candidate Studio client was rebuilt from this exact worktree using the host's supported Node 24 runtime before launch. Browser driving used only rendered controls, coordinate clicks, keyboard text entry, and rendered-page observation; it made no private Studio API calls and did not inject browser DOM or application state.

## Cold-start questions and results

1. Does **New Blueprint → Recommended** save the intended bounded game math after naming it **Valera Mathematician** / `valera-mathematician`? **Yes.** The created `blueprint.json` had five literal strips of four stops: 1,024 raw combinations.
2. Does the saved Blueprint immediately play a real round? **Yes.** **Play → New Play session → Spin** rendered a completed round and its **Inspect round artifact** control.
3. Does the dependent build flow complete? **Yes.** One visible **Generate outcome library (base)** action rendered `Generated 1,024 outcomes`; the now-enabled **Run Stake Engine Export (base)** action rendered `Exported 4 file(s)`.

No material product finding was exposed in the definitive rerun, so no product remediation or affected-workflow retry was required.

## Concise visible-control transcript

`New Blueprint` → `Recommended` → fill Game name, Game id, and Description → `Create Project` → `Play` → `New Play session` → `Spin` → `Build/Export` → `Generate outcome library (base)` → `Run Stake Engine Export (base)`.

## Evidence

| State | Screenshot | SHA-256 |
| --- | --- | --- |
| Completed rendered Play round | `01-play-round.png` | `a4a2f0bf8d50feae3431691ec724e566a3ddc415b168537fc0ad5c61bba5527f` |
| Visible Outcome Library completion | `02-outcome-library-generated.png` | `7c1ec912208511de6708383390dac2c8ad4052087d04bdd42ec9a0a761c9cda4` |
| Visible dependent Stake export completion | `03-stake-export-complete.png` | `1b34cb717f2bce322dba19acf269938fc5ad1bf855f95b56a53bdb278cb0af06` |
