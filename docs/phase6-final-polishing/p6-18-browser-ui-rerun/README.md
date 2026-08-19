# P6-18 independent cold-start Studio rerun — finding

Candidate: `3a37bdd1327b267c521886a987a075c36159cd07`
Run: 2026-08-19, fresh local Studio and Chrome profile. Browser driving was restricted to visible controls, coordinate mouse clicks, keyboard input, and rendered-page observation.

## Cold-start question and remediation

The first isolated run used a temporary directory as Studio's managed-project Documents location. Studio correctly refused that unsafe destination before creating a project. The rerun used the normal platform Documents location with a new Studio process and browser profile; **New Blueprint → Recommended → Create Project** then completed and opened the workspace. No product finding was recorded for that expected safety refusal.

## Verified

1. In **Game Model → Game basics**, entered and saved **Valera Mathematician** / `valera-mathematician` plus a description.
2. In **Play**, created a new Play session and spun once. A complete rendered no-win round and its **Inspect round artifact** control appeared.

## Finding — Outcome Library generation does not complete

On the one visible **Build/Export → Generate outcome library (base)** click, the page remained in the generation state for more than five minutes. No generated-library result or output directory appeared; **Run Stake Engine Export (base)** stayed disabled with “Generate an outcome library above first.” The Studio process remained CPU-active.

The persisted Blueprint created through this same public workflow contains five 28-stop reel strips (rather than the 4-stop Recommended strips intended by this candidate), making the inferred raw stop space (28^5), not (4^5). This explains why the corrected cold-start generation remains impractically long. The dependent Stake export therefore could not be exercised. Remediation and an affected-workflow rerun remain outstanding.

## Evidence

- `01-play-round.png` — completed rendered Play round; SHA-256 `727c595d7746a4725bd24bc16edcf7dc795cae0616a27fa22d344641032a8ba7`.
- `02-outcome-library-no-result.png` — rendered Build/Export page during the still-running one-click generation; Stake remains disabled; SHA-256 `cf91b368126e652d607bf1d2801cc7417d077e1129848ecd67059f703e498ba2`.
