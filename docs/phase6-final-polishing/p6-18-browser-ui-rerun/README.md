# P6-18 independent cold-start Studio rerun — passed

Candidate: `48bd833e1ea3b9b8a0cdefc9ea95cdfd4ee96270`

Finding id: `p6-18-mathematician-cold-start-workflow`

Run: 2026-08-19; one fresh local Studio/client, a fresh Studio registry, and a separate fresh Chrome profile. The candidate client was rebuilt with Node 24 before launch. Browser control used public Studio routes, rendered-control coordinate clicks, and keyboard input only.

## Cold-start questions and results

1. Can a creator make and save a viable Valera mathematician Blueprint? **Yes.** `New Blueprint` → `Recommended` was edited in all six Game Model sections: basics, layout/paylines, symbols, literal reel strips, paytable, and bets. `Create Project` saved it, and its visible Projects row reopened successfully.
2. Can the resulting project be understood through Play, Simulation, and Replay? **Yes.** `Find any win` produced a settled winning round; a 100-round Simulation rendered RTP **108.00%** (with the expected low-sample/no-seed warnings); Replay selected that recorded Session Spin and opened its Round inspector.
3. Can the dependent output flow finish from the same saved project? **Yes.** `Generate outcome library (base)` rendered **Generated 1,024 outcomes**, then `Run Stake Engine Export (base)` rendered **Exported 4 file(s)**.

No material product finding was exposed, so no product remediation or rerun was required.

See [ACTION-TRANSCRIPT.txt](ACTION-TRANSCRIPT.txt) for the concise rendered-control transcript. No generated output trees, browser artifacts, or screenshots are retained in this cleaned evidence revision.
