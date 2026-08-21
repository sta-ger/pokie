# P6V-02 independent host-side rerun

Candidate: `9c12da6517da12285a1a52abf0f150dfd38bd8df`  
Date: 2026-08-21  
Launches: two fresh Chrome profiles, each served by `node ./dist/cli/pokie.js --no-open` from this checkout.

## Result

Finding: at an approximately 405 px viewport the initial **Design Game** screen leaves a large empty left column and compresses the primary content into a narrow, clipped-looking column. The introduction, primary action, advanced-options link, model-section navigation, and form labels no longer have a usable mobile hierarchy. Opening the visible hamburger control did not restore a readable full-width design surface.

This is a rendered, repeatable P1 cold-start failure; it is not a driver timeout or a private-API observation.

## First-launch transcript

- Recommended Design Game created `Starter Slot`; workspace opened successfully.
- Game Model exposed Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics, and Limits. The Reels editor exposed `Per-reel (Reel Strip Modeler)`.
- A Play session spun one real round and displayed its settled grid/result.
- One Simulation run completed and showed its metrics plus the visible no-seed reproducibility warning.
- Replay loaded the recorded Play spin and displayed the round inspector.
- Build/Export generated an exact base outcome library, then completed Stake Engine export. The initially disabled Stake control enabled after generation.
- A visible host `zenity` folder picker opened from Build/Export `Browse…` and was cancelled through its rendered native UI.
- Closing the project returned to Home; Projects reopened the same newly created `Starter Slot` entry.

## Cold-start / responsive transcript

- Second launch used a distinct new Chrome profile and no project/documentation/source/audit-script input.
- The initial blank capture had no rendered product error; a bounded readiness inspection subsequently observed the rendered Design Game screen, so the earlier fixed wait was not treated as a finding.
- At 405 px, the captured initial Design Game screen shows the responsive hierarchy defect above. The hamburger action was also exercised and did not make the surface readable.

## Bound evidence

| File | SHA-256 | Purpose |
| --- | --- | --- |
| `desktop-design-game.png` | `382dbb8eac171cecfbcadce05d683f531c6cdbd3198595d9be58c21a4f8105b2` | Fresh desktop Design Game baseline. |
| `mobile-405-design-game.png` | `d0d75cb4718634e08aa0c736742e0dceb633cb68fc16f917475f0254974604ad` | Reproduces the 405 px cold-start usability failure. |
