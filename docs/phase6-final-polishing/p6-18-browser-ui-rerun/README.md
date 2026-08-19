# P6-18 independent cold-start Studio rerun — finding

Candidate: `00404c6a42bdcf7616bb94e949b5781b4f5481cb`
Run: 2026-08-19; fresh local Studio/client, fresh Chrome profile, and no existing Studio project opened. Controls were activated only through rendered browser mouse/keyboard interactions.

## Cold-start questions

None. The rendered Design Game and project workflow exposed the needed choices and controls.

## Verified before the finding

1. Created **New Blueprint → Recommended** as `valera-mathematician` / **Valera Mathematician**.
2. Edited **Game Model** metadata, saved description `P6-18 independent cold-start verification`, and observed the saved view.
3. Opened **Play**, created a session, and spun once. A complete rendered round appeared. This is the remediation rerun for the earlier P6-18 Play finding; it now passes.
4. Ran a 25-round **Simulation** and observed its rendered RTP/recent-runs report.
5. Opened **Replay → Session Spin**, selected the recorded round, and observed the loaded replay inspector.

## Finding: Outcome Library blocks Build/Export and Stake

On **Build/Export**, the visible **Generate outcome library (base)** action returned to the unchanged page: no generated-library result appeared and the visible **Run Stake Engine Export (base)** card remained blocked by “Generate an outcome library above first.” No second generate attempt was made.

This prevents the requested Outcome Library, Stake export, and subsequent Home Projects completion checks. Remediation and an affected-workflow rerun remain outstanding for this newly discovered finding.

## Evidence

- `01-play-round.png` — rendered successful fixed Play round; SHA-256 `1ad11274be6bc592b80d305ff64ad2f336b800253296c5f1ca1452a03105e2ed`.
- `02-outcome-library-no-result.png` — rendered Build/Export state after the one generate action; SHA-256 `2eb6fcd9d4aee974bd5740ad2fce14c841f8aa65e1bbb8a3f96303ed7c232df8`.
