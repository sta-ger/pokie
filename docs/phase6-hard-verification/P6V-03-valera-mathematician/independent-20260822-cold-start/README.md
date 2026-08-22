# P6V-03 independent cold-start Studio journey

Candidate: `67619f2e618790f32b9122f44184e6e54986bbe9` (built locally before launch).  Date: 2026-08-22.  One fresh Studio registry and one fresh Chrome profile were created for this run; neither contained prior P6V-03 material.  Studio was launched once from this checkout with `node ./dist/cli/pokie.js --no-open`.

All actions used the rendered Studio workflow.  No private application API, direct registry write, DOM/state injection, or pre-existing project was used.

## Journey transcript

1. In **Design Game**, created the persisted Blueprint `valera-mathematician`, displayed as **Valera Mathematician** v0.1.0.  The saved Game Model showed the literal five-reel, three-row, three-payline model, four symbols (A/K/Q/J), literal reel strips, and rendered reel window.
2. In **Play**, started a session, settled one regular spin, then used rendered **Find any win**.  The final recorded round rendered the green semantic result **Round complete — You won 2.00**.
3. In **Simulation**, ran the rendered 10,000-round job.  Review rendered RTP **95.56%**, hit frequency **10.45%**, volatility **3.60**, maximum win **36.00**, and a completed recent run.
4. In **Replay → Session Spin**, selected the recorded Find-any-win round.  Studio rendered it as loaded, complete, inspectable, and exportable, with the recorded session/round identity.
5. In **Build/Export**, generated the exact base outcome library: **1,024 outcomes**, exact RTP **100.78%**.  Then ran the enabled rendered **Stake Engine Export (base)**; Studio reported **Exported 4 file(s)**.

The first screenshot is the persistence boundary: the model is shown after project creation from the saved workspace, while all later surfaces display the same project name and version.

## Evidence checksums

| File | SHA-256 |
| --- | --- |
| `01-game-model-literal.png` | `c70c6ca5c41456ae85148b67c9b82b11ddb0e14aac92df29b574f9eec2c4425b` |
| `02-play-find-win.png` | `bf2eb707d4fab3b6fa6f70763822cbb6b699cec1d47cc0e05e0c2d9df4abd643` |
| `03-simulation.png` | `89ec3b9be9d9bc236940d60467188a6d4b34d3cba2a4bc4fc51499b25475e6ae` |
| `04-replay-recorded-round.png` | `277f1305229266985bc3d11f63cfaa8be9aa45efab8ea6d07200b12ef4119d6c` |
| `05-outcome-library-stake-export.png` | `9bc2890a316bdd6512162ca39f336c42675cb74be92ab33b6d08bab2fcd9943f` |
